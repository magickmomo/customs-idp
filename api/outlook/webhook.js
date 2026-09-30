import crypto from "node:crypto";

const GRAPH="https://graph.microsoft.com/v1.0";

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).send("Method not allowed");
  if(req.query?.validationToken){
    res.setHeader("Content-Type","text/plain");
    return res.status(200).send(String(req.query.validationToken));
  }
  try{
    const notifications=Array.isArray(req.body?.value)?req.body.value:[];
    for(const notification of notifications){
      await processNotification(notification);
    }
    return res.status(202).json({ok:true,processed:notifications.length});
  }catch(error){
    console.error("Outlook webhook error",error);
    return res.status(202).json({ok:false,error:error.message||"Webhook processing failed."});
  }
}

async function processNotification(notification){
  const connectionRows=await supabaseFetch("outlook_connections?select=*&status=eq.connected&limit=1");
  const connection=connectionRows[0];
  if(!connection)return;
  if(connection.client_state && String(notification.clientState||"")!==String(connection.client_state))return;
  const accessToken=await getAccessToken(connection);
  const messageId=String(notification.resourceData?.id||"").trim();
  if(!messageId)return;
  const message=await graphGet("/me/messages/"+encodeURIComponent(messageId)+"?$select=id,internetMessageId,subject,body,from,toRecipients,receivedDateTime,hasAttachments",accessToken);
  const attachments=message.hasAttachments?await getAttachments(message.id,accessToken):[];
  const payload={
    to:firstAddress(message.toRecipients)||connection.email,
    from:message.from?.emailAddress?.address||"",
    subject:message.subject||"",
    text:stripHtml(message.body?.content||""),
    html:message.body?.content||"",
    messageId:message.internetMessageId||message.id,
    receivedAt:message.receivedDateTime||new Date().toISOString(),
    attachments
  };
  await postToIngest(payload);
}

async function getAttachments(messageId,token){
  const data=await graphGet("/me/messages/"+encodeURIComponent(messageId)+"/attachments?$select=id,name,contentType,size,contentBytes,isInline",token);
  return (data.value||[]).filter(a=>!a.isInline && a.contentBytes).map(a=>({
    filename:a.name,
    mimeType:a.contentType||"application/octet-stream",
    size:a.size||0,
    contentBase64:a.contentBytes
  }));
}

async function getAccessToken(connection){
  const refresh=decrypt(connection.refresh_token);
  const clientId=String(process.env.OUTLOOK_CLIENT_ID||"").trim();
  const clientSecret=String(process.env.OUTLOOK_CLIENT_SECRET||"").trim();
  const response=await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({
    client_id:clientId,client_secret:clientSecret,refresh_token:refresh,grant_type:"refresh_token",scope:"openid profile offline_access User.Read Mail.Read"
  })});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error_description||"Unable to refresh Outlook access token.");
  if(data.refresh_token){
    await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(connection.id),{method:"PATCH",body:JSON.stringify({refresh_token:encrypt(data.refresh_token),updated_at:new Date().toISOString()})});
  }
  return data.access_token;
}

async function postToIngest(payload){
  const base=String(process.env.VERCEL_URL||"customs-idp.vercel.app").trim();
  const response=await fetch("https://"+base+"/api/email-ingest",{method:"POST",headers:{"Content-Type":"application/json","x-email-ingest-secret":String(process.env.EMAIL_INGEST_SECRET||"")},body:JSON.stringify(payload)});
  if(!response.ok)throw new Error("Email ingestion returned HTTP "+response.status+": "+await response.text());
}
async function graphGet(path,token){const r=await fetch(GRAPH+path,{headers:{Authorization:"Bearer "+token}});const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||"Microsoft Graph request failed.");return d;}
function firstAddress(list){return Array.isArray(list)?(list[0]?.emailAddress?.address||""): "";}

function stripHtml(value){return String(value).replace(/<br\s*\/?>/gi,"\n").replace(/<\/p>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").trim();}
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
  const r=await fetch(url+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...(options.headers||{})}});
  if(!r.ok)throw new Error(await r.text());
  const t=await r.text();return t?JSON.parse(t):[];
}
