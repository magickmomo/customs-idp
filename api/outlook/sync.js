import crypto from "node:crypto";
import { requireAuth } from "../authGuard.js";

const GRAPH="https://graph.microsoft.com/v1.0";

export default async function handler(req,res){
  if(!requireAuth(req,res))return;
  if(req.method!=="POST" && req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  try{
    const rows=await supabaseFetch("outlook_connections?select=*&status=eq.connected&limit=1");
    const connection=rows[0];
    if(!connection)return res.status(200).json({ok:true,connected:false,processed:0,message:"Outlook is not connected."});

    const token=await getAccessToken(connection);
    const data=await graphGet("/me/mailFolders('Inbox')/messages?$top=25&$orderby=receivedDateTime%20desc&$select=id,internetMessageId,subject,body,from,toRecipients,receivedDateTime,hasAttachments",token);
    const candidates=(data.value||[]).filter(message=>/CUSTOMS-IDP/i.test(String(message.subject||"")));

    let processed=0,duplicates=0,failed=0;
    for(const message of candidates){
      const messageId=message.internetMessageId||message.id;
      const existing=await supabaseFetch("document_packs?ticket=eq."+encodeURIComponent(messageId)+"&select=id&limit=1");
      if(existing[0]){duplicates++;continue;}
      try{
        const attachments=message.hasAttachments?await getAttachments(message.id,token):[];
        await postToIngest({
          to:firstAddress(message.toRecipients)||connection.email,
          from:message.from?.emailAddress?.address||"",
          subject:message.subject||"",
          text:stripHtml(message.body?.content||""),
          html:message.body?.content||"",
          messageId,
          receivedAt:message.receivedDateTime||new Date().toISOString(),
          attachments
        });
        processed++;
      }catch(error){
        failed++;
        console.error("Outlook sync message failed",messageId,error);
      }
    }
    return res.status(200).json({ok:true,connected:true,checked:candidates.length,processed,duplicates,failed});
  }catch(error){
    console.error("Outlook sync error",error);
    return res.status(500).json({ok:false,error:error.message||"Outlook sync failed."});
  }
}

async function getAttachments(messageId,token){
  const data=await graphGet("/me/messages/"+encodeURIComponent(messageId)+"/attachments?$select=id,name,contentType,size,contentBytes,isInline",token);
  return (data.value||[]).filter(a=>!a.isInline&&a.contentBytes).map(a=>({
    filename:a.name,
    mimeType:a.contentType||"application/octet-stream",
    size:a.size||0,
    contentBase64:a.contentBytes
  }));
}

async function getAccessToken(connection){
  const refresh=decrypt(connection.refresh_token);
  const response=await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token",{
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      client_id:String(process.env.OUTLOOK_CLIENT_ID||"").trim(),
      client_secret:String(process.env.OUTLOOK_CLIENT_SECRET||"").trim(),
      refresh_token:refresh,
      grant_type:"refresh_token",
      scope:"openid profile offline_access User.Read Mail.Read"
    })
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error_description||"Unable to refresh Outlook access token.");
  if(data.refresh_token){
    await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(connection.id),{
      method:"PATCH",
      body:JSON.stringify({refresh_token:encrypt(data.refresh_token),updated_at:new Date().toISOString()})
    });
  }
  return data.access_token;
}

async function postToIngest(payload){
  const base=String(process.env.VERCEL_URL||"customs-idp.vercel.app").trim();
  const response=await fetch("https://"+base+"/api/email-ingest",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-email-ingest-secret":String(process.env.EMAIL_INGEST_SECRET||"")
    },
    body:JSON.stringify(payload)
  });
  if(!response.ok)throw new Error("Email ingestion returned HTTP "+response.status+": "+await response.text());
}

async function graphGet(path,token){
  const response=await fetch(GRAPH+path,{headers:{Authorization:"Bearer "+token}});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error?.message||"Microsoft Graph request failed.");
  return data;
}

function firstAddress(list){return Array.isArray(list)?(list[0]?.emailAddress?.address||""):"";}

function stripHtml(value){
  return String(value).replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").trim();
}

function decrypt(value){
  const key=Buffer.from(String(process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY||""),"base64");
  if(key.length!==32)throw new Error("OUTLOOK_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  const [ivRaw,tagRaw,dataRaw]=String(value||"").split(".");
  const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(ivRaw,"base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw,"base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw,"base64url")),decipher.final()]).toString("utf8");
}

function encrypt(value){
  const key=Buffer.from(String(process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY||""),"base64");
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}

async function supabaseFetch(path,options={}){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Supabase configuration is missing.");
  const response=await fetch(url+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...(options.headers||{})}});
  if(!response.ok)throw new Error(await response.text());
  const text=await response.text();
  return text?JSON.parse(text):[];
}
