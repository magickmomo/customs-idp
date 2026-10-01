import crypto from "node:crypto";
import { requireAuth } from "./authGuard.js";

const GRAPH="https://graph.microsoft.com/v1.0";
const AUTHORITY="https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN_URL="https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

export default async function handler(req,res){
  const pathname=String(req.url||"").split("?")[0].replace(/\/+$/,"").toLowerCase();
  const action=pathname.endsWith("/webhook")?"webhook":String(req.query?.action||"status").toLowerCase();
  if(action==="connect")return connect(req,res);
  if(action==="status")return status(req,res);
  if(action==="sync")return sync(req,res);
  if(action==="renew")return renew(req,res);
  if(action==="webhook")return webhook(req,res);
  return res.status(400).json({error:"Unknown Outlook action."});
}

async function connect(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  if(!requireAuth(req,res))return;
  const clientId=String(process.env.OUTLOOK_CLIENT_ID||"").trim();
  if(!clientId)return res.status(500).json({error:"OUTLOOK_CLIENT_ID is not configured."});
  const redirectUri=getRedirectUri();
  const state=signState({nonce:crypto.randomBytes(24).toString("hex"),createdAt:Date.now()});
  const params=new URLSearchParams({client_id:clientId,response_type:"code",redirect_uri:redirectUri,response_mode:"query",scope:"openid profile offline_access User.Read Mail.Read",state});
  return res.status(200).json({authorizationUrl:AUTHORITY+"?"+params.toString()});
}

async function status(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  if(!requireAuth(req,res))return;
  try{
    const rows=await supabaseFetch("outlook_connections?select=email,display_name,status,subscription_id,subscription_expires_at,updated_at&status=eq.connected&order=updated_at.desc&limit=1");
    const row=rows[0]||null;
    return res.status(200).json({connected:Boolean(row),connection:row});
  }catch(error){return res.status(503).json({error:error.message});}
}

async function sync(req,res){
  if(!requireAuth(req,res))return;
  if(req.method!=="POST"&&req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  try{
    console.info("Outlook subscription renewal started");
    const rows=await supabaseFetch("outlook_connections?select=*&status=eq.connected&limit=1");
    const connection=rows[0];
    if(!connection)return res.status(200).json({ok:true,connected:false,processed:0,message:"Outlook is not connected."});
    const token=await getAccessToken(connection);
    const data=await graphGet("/me/messages?$top=50&$orderby=receivedDateTime%20desc&$select=id,internetMessageId,subject,body,from,toRecipients,receivedDateTime,hasAttachments",token);
    const candidates=(data.value||[]).filter(message=>/CUSTOMS-IDP/i.test(String(message.subject||"")));
    let processed=0,duplicates=0,failed=0; const failures=[];
    for(const message of candidates){
      const graphMessageId=String(message.id||"").trim();
      const messageId=String(message.internetMessageId||"").trim()||null;
      const ticket=graphMessageId ? "GRAPH:"+graphMessageId : (messageId || "");
      const existing=await findExistingEmailPack({ticket,messageId,subject:message.subject||"",receivedAt:message.receivedDateTime||"",from:message.from?.emailAddress?.address||""});
      const existingFiles=existing[0]?.extracted_data?._manager?.uploadedFiles;
      const repair=Boolean(existing[0]&&(!Number(existing[0].docs||0)||!Array.isArray(existingFiles)||!existingFiles.length));
      if(existing[0]&&!repair){duplicates++;continue;}
      try{
        const attachments=message.hasAttachments?await getAttachments(message.id,token):[];
        await postToIngest({
          to:firstAddress(message.toRecipients)||connection.email,
          from:message.from?.emailAddress?.address||"",
          subject:message.subject||"",
          text:stripHtml(message.body?.content||""),
          html:message.body?.content||"",
          messageId,
          ticket,
          receivedAt:message.receivedDateTime||new Date().toISOString(),
          attachments,
          repair
        });
        processed++;
      }catch(error){failed++;failures.push(error.message||"Unknown failure");console.error("Outlook sync message failed",messageId,error);}
    }
    return res.status(200).json({ok:true,connected:true,checked:candidates.length,processed,duplicates,failed,failures});
  }catch(error){
    console.error("Outlook sync error",error);
    return res.status(500).json({ok:false,error:error.message||"Outlook sync failed."});
  }
}

async function webhook(req,res){
  // Microsoft Graph validates a notification endpoint with a validationToken
  // query parameter before it starts delivering change notifications.
  if(req.method==="GET"){
    const validationToken=String(req.query?.validationToken||"");
    if(!validationToken)return res.status(400).send("validationToken is required.");
    res.setHeader("Content-Type","text/plain; charset=utf-8");
    return res.status(200).send(validationToken);
  }
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});

  const notifications=Array.isArray(req.body?.value)?req.body.value:[];
  if(!notifications.length)return res.status(202).json({ok:true,processed:0});

  let processed=0,duplicates=0,failed=0;
  const failures=[];
  for(const notification of notifications){
    try{
      const subscriptionId=String(notification?.subscriptionId||"").trim();
      const clientState=String(notification?.clientState||"").trim();
      if(!subscriptionId)throw new Error("Outlook notification is missing subscriptionId.");

      const connections=await supabaseFetch(
        "outlook_connections?subscription_id=eq."+encodeURIComponent(subscriptionId)+"&status=eq.connected&select=*&limit=1"
      );
      const connection=connections[0];
      if(!connection)throw new Error("No connected Outlook account matches subscription "+subscriptionId+".");
      if(!clientState||clientState!==String(connection.client_state||""))throw new Error("Outlook notification clientState did not match the active subscription.");

      const token=await getAccessToken(connection);
      const messageIdFromNotification=String(notification?.resourceData?.id||"").trim();
      if(!messageIdFromNotification)throw new Error("Outlook notification is missing the message id.");

      const message=await graphGet(
        "/me/messages/"+encodeURIComponent(messageIdFromNotification)+"?$select=id,internetMessageId,subject,body,from,toRecipients,receivedDateTime,hasAttachments",
        token
      );
      if(!/CUSTOMS-IDP/i.test(String(message.subject||"")))continue;

      const graphMessageId=String(message.id||"").trim();
      const internetMessageId=String(message.internetMessageId||"").trim()||null;
      const ticket=graphMessageId?"GRAPH:"+graphMessageId:(internetMessageId||"");
      const existing=await findExistingEmailPack({
        ticket,
        messageId:internetMessageId,
        subject:message.subject||"",
        receivedAt:message.receivedDateTime||"",
        from:message.from?.emailAddress?.address||""
      });
      const existingFiles=existing?.extracted_data?._manager?.uploadedFiles;
      const repair=Boolean(existing&&(!Number(existing.docs||0)||!Array.isArray(existingFiles)||!existingFiles.length));
      if(existing&&!repair){duplicates++;continue;}

      const attachments=message.hasAttachments?await getAttachments(message.id,token):[];
      await postToIngest({
        to:firstAddress(message.toRecipients)||connection.email,
        from:message.from?.emailAddress?.address||"",
        subject:message.subject||"",
        text:stripHtml(message.body?.content||""),
        html:message.body?.content||"",
        messageId:internetMessageId,
        ticket,
        receivedAt:message.receivedDateTime||new Date().toISOString(),
        attachments,
        repair
      });
      processed++;
    }catch(error){
      failed++;
      failures.push(error.message||"Unknown webhook failure");
      console.error("Outlook webhook notification failed",error);
    }
  }
  return res.status(202).json({ok:true,processed,duplicates,failed,failures});
}

async function renew(req,res){
  if(req.method!=="GET"&&req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const cronSecret=String(process.env.CRON_SECRET||"").trim();
  const supplied=String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim();
  if(cronSecret&&supplied!==cronSecret)return res.status(401).json({error:"Unauthorized"});
  try{
    const rows=await supabaseFetch("outlook_connections?select=*&status=eq.connected&limit=1");
    const connection=rows[0];
    if(!connection)return res.status(200).json({ok:true,message:"No Outlook connection configured."});
    const accessToken=await getAccessToken(connection);
    const clientState=connection.client_state||crypto.randomBytes(24).toString("hex");
    if(connection.subscription_id)await graphDelete("/subscriptions/"+encodeURIComponent(connection.subscription_id),accessToken).catch(()=>{});
    const subscription=await graphPost("/subscriptions",accessToken,{
      changeType:"created",
      notificationUrl:"https://customs-idp.vercel.app/api/outlook/webhook",
      resource:"me/mailFolders('Inbox')/messages",
      expirationDateTime:new Date(Date.now()+2*24*60*60*1000).toISOString(),
      clientState
    });
    await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(connection.id),{method:"PATCH",body:JSON.stringify({subscription_id:subscription.id,subscription_expires_at:subscription.expirationDateTime,client_state:clientState,updated_at:new Date().toISOString()})});
    console.info("Outlook subscription renewed", {subscriptionId:subscription.id,expiresAt:subscription.expirationDateTime});
    return res.status(200).json({ok:true,subscriptionId:subscription.id,expiresAt:subscription.expirationDateTime});
  }catch(error){
    console.error("Outlook subscription renewal failed",error);
    return res.status(500).json({ok:false,error:error.message||"Unable to renew Outlook subscription."});
  }
}

function getRedirectUri(){
  const configured=String(process.env.OUTLOOK_REDIRECT_URI||"").trim();
  if(configured)return configured;
  const appUrl=String(process.env.APP_URL||"").trim();
  if(appUrl)return appUrl.replace(/\/+$/,"")+"/api/outlook/callback";
  if(process.env.VERCEL_ENV==="production")return "https://customs-idp.vercel.app/api/outlook/callback";
  return "http://localhost:5173/api/outlook/callback";
}
function signState(payload){
  const raw=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret=String(process.env.IDP_AUTH_SECRET||process.env.EMAIL_INGEST_SECRET||"");
  if(!secret)throw new Error("IDP_AUTH_SECRET or EMAIL_INGEST_SECRET is required for Outlook OAuth state.");
  const sig=crypto.createHmac("sha256",secret).update(raw).digest("base64url");
  return raw+"."+sig;
}
async function getAttachments(messageId,token){
  const data=await graphGet("/me/messages/"+encodeURIComponent(messageId)+"/attachments?$select=id,name,contentType,size,isInline",token);
  const attachments=[];
  for(const attachment of (data.value||[])){
    if(attachment.isInline)continue;
    const detail=await graphGet("/me/messages/"+encodeURIComponent(messageId)+"/attachments/"+encodeURIComponent(attachment.id),token);
    if(!detail?.contentBytes)continue;
    attachments.push({
      filename:detail.name||attachment.name,
      mimeType:detail.contentType||attachment.contentType||"application/octet-stream",
      size:detail.size||attachment.size||0,
      contentBase64:detail.contentBytes
    });
  }
  return attachments;
}
async function getAccessToken(connection){
  const refresh=decrypt(connection.refresh_token);
  const response=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({
    client_id:String(process.env.OUTLOOK_CLIENT_ID||"").trim(),
    client_secret:String(process.env.OUTLOOK_CLIENT_SECRET||"").trim(),
    refresh_token:refresh,
    grant_type:"refresh_token",
    scope:"openid profile offline_access User.Read Mail.Read"
  })});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error_description||"Unable to refresh Outlook access token.");
  if(data.refresh_token)await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(connection.id),{method:"PATCH",body:JSON.stringify({refresh_token:encrypt(data.refresh_token),updated_at:new Date().toISOString()})});
  return data.access_token;
}
async function findExistingEmailPack({ticket,messageId,subject,receivedAt,from}){
  if(ticket){
    const byTicket=await supabaseFetch("document_packs?ticket=eq."+encodeURIComponent(ticket)+"&select=id,docs,extracted_data&limit=1");
    if(byTicket[0])return byTicket[0];
  }
  if(messageId){
    const byMessage=await supabaseFetch("document_packs?extracted_data->email->>messageId=eq."+encodeURIComponent(messageId)+"&select=id,docs,extracted_data&limit=1").catch(()=>[]);
    if(byMessage[0])return byMessage[0];
  }
  // Older packs were keyed only by internetMessageId. As a final guard,
  // treat the same sender/subject/received timestamp as the same email.
  if(subject&&receivedAt&&from){
    const byFingerprint=await supabaseFetch(
      "document_packs?customer=not.is.null&select=id,docs,extracted_data,ticket&order=created_at.desc&limit=100"
    ).catch(()=>[]);
    const targetSubject=String(subject).trim().toLowerCase();
    const targetFrom=String(from).trim().toLowerCase();
    const targetReceived=String(receivedAt);
    const match=byFingerprint.find(row=>{
      const email=row?.extracted_data?.email;
      return email
        && String(email.subject||"").trim().toLowerCase()===targetSubject
        && String(email.from||"").trim().toLowerCase()===targetFrom
        && String(email.receivedAt||"")===targetReceived;
    });
    if(match)return match;
  }
  return null;
}

async function postToIngest(payload){
  const response=await fetch("https://customs-idp.vercel.app/api/email-ingest",{method:"POST",headers:{"Content-Type":"application/json","x-email-ingest-secret":String(process.env.EMAIL_INGEST_SECRET||"")},body:JSON.stringify(payload)});
  if(!response.ok)throw new Error("Email ingestion returned HTTP "+response.status+": "+await response.text());
}
async function graphGet(path,token){
  const response=await fetch(GRAPH+path,{headers:{Authorization:"Bearer "+token}});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error?.message||"Microsoft Graph request failed.");
  return data;
}
async function graphPost(path,token,body){
  const response=await fetch(GRAPH+path,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error?.message||"Graph subscription failed.");
  return data;
}
async function graphDelete(path,token){
  const response=await fetch(GRAPH+path,{method:"DELETE",headers:{Authorization:"Bearer "+token}});
  if(!response.ok)throw new Error(await response.text());
}
function firstAddress(list){return Array.isArray(list)?(list[0]?.emailAddress?.address||""):"";}
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
  if(key.length!==32)throw new Error("OUTLOOK_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
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
