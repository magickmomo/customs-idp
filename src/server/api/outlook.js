import crypto from "node:crypto";
import { requireAuth } from "./authGuard.js";

const GRAPH="https://graph.microsoft.com/v1.0";
const AUTHORITY="https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL="https://login.microsoftonline.com/common/oauth2/v2.0/token";

export default async function handler(req,res){
  const pathname=String(req.url||"").split("?")[0].replace(/\/+$/,"").toLowerCase();
  const action=pathname.endsWith("/webhook")?"webhook":String(req.query?.action||req.query?.route||"status").toLowerCase();
  if(action==="connect")return connect(req,res);
  if(action==="status")return status(req,res);
  if(action==="sync")return sync(req,res);
  if(action==="sync-status")return syncStatus(req,res);
  if(action==="renew-subscription")return renewSubscription(req,res);
  if(action==="disconnect")return disconnect(req,res);
  if(action==="process-webhook")return processWebhook(req,res);
  if(action==="renew")return renew(req,res);
  if(action==="webhook")return webhook(req,res);
  return res.status(400).json({error:"Unknown Outlook action."});
}

async function connect(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  const context=requireAuth(req,res);
  if(!context)return;
  const clientId=String(process.env.OUTLOOK_CLIENT_ID||"").trim();
  if(!clientId)return res.status(500).json({error:"OUTLOOK_CLIENT_ID is not configured."});
  const redirectUri=getRedirectUri();
  const state=signState({nonce:crypto.randomBytes(24).toString("hex"),createdAt:Date.now(),organisationId:context.organisationId});
  const params=new URLSearchParams({client_id:clientId,response_type:"code",redirect_uri:redirectUri,response_mode:"query",scope:"openid profile offline_access User.Read Mail.Read",state});
  return res.status(200).json({authorizationUrl:AUTHORITY+"?"+params.toString()});
}

async function status(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  const context=requireAuth(req,res);
  if(!context)return;
  try{
    const rows=await supabaseFetch("outlook_connections?organisation_id=eq."+encodeURIComponent(context.organisationId)+"&select=email,display_name,status,subscription_id,subscription_expires_at,updated_at,last_sync_started_at,last_sync_completed_at,last_sync_status,last_sync_error,last_sync_checked,last_sync_queued,last_sync_processed,last_sync_duplicates,last_sync_failed,last_renewed_at,last_renewal_error&status=eq.connected&order=updated_at.desc&limit=1");
    const row=Array.isArray(rows)?(rows[0]||null):null;
    const expiry=row?.subscription_expires_at?new Date(row.subscription_expires_at):null;
    const expiresAt=expiry&&!Number.isNaN(expiry.getTime())?expiry.toISOString():null;
    const expired=Boolean(expiry&&expiry.getTime()<=Date.now());
    const expiringSoon=Boolean(expiry&&!expired&&expiry.getTime()<=Date.now()+24*60*60*1000);
    return res.status(200).json({connected:Boolean(row),connection:row,subscriptionHealth:row?{expired,expiringSoon,expiresAt}:null});
  }catch(error){return res.status(503).json({error:error.message});}
}

async function sync(req,res){
  const context=requireAuth(req,res);
  if(!context)return;
  if(req.method!=="POST"&&req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  try{
    const rows=await supabaseFetch("outlook_connections?organisation_id=eq."+encodeURIComponent(context.organisationId)+"&status=eq.connected&select=id,email&limit=1");
    const connection=Array.isArray(rows)?rows[0]:null;
    if(!connection)return res.status(409).json({ok:false,connected:false,error:"No Outlook inbox is connected."});
    const runs=await supabaseFetch("outlook_sync_runs",{method:"POST",body:JSON.stringify({organisation_id:context.organisationId,connection_id:connection.id,status:"queued"}),headers:{Prefer:"return=representation"}});
    const run=Array.isArray(runs)?runs[0]:null;
    if(!run?.id)throw new Error("Unable to create Outlook sync run.");
    return res.status(202).json({ok:true,connected:true,syncRunId:run.id,status:run.status});
  }catch(error){
    return res.status(500).json({ok:false,error:error.message||"Unable to start Outlook sync."});
  }
}

async function syncStatus(req,res){
  const context=requireAuth(req,res);
  if(!context)return;
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  const id=String(req.query?.id||"").trim();
  if(!id)return res.status(400).json({error:"Sync run id is required."});
  try{
    const rows=await supabaseFetch("outlook_sync_runs?id=eq."+encodeURIComponent(id)+"&organisation_id=eq."+encodeURIComponent(context.organisationId)+"&limit=1");
    const run=Array.isArray(rows)?rows[0]:null;
    if(!run)return res.status(404).json({error:"Sync run not found."});
    return res.status(200).json({ok:true,run});
  }catch(error){return res.status(503).json({error:error.message||"Unable to load sync status."});}
}

async function renewSubscription(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const context=requireAuth(req,res);
  if(!context)return;
  let connection;
  try{
    const rows=await supabaseFetch("outlook_connections?organisation_id=eq."+encodeURIComponent(context.organisationId)+"&status=eq.connected&select=*&limit=1");
    connection=Array.isArray(rows)?rows[0]:null;
    if(!connection)return res.status(409).json({ok:false,error:"No Outlook inbox is connected."});
    const result=await renewConnection(connection);
    return res.status(200).json({ok:true,subscriptionId:result.subscriptionId,expiresAt:result.expiresAt});
  }catch(error){
    const message=error.message||"Unable to renew Outlook subscription.";
    if(connection)await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(connection.id),{method:"PATCH",body:JSON.stringify({last_renewal_error:message,updated_at:new Date().toISOString()})}).catch(()=>{});
    return res.status(502).json({ok:false,error:message});
  }
}

async function disconnect(req,res){
  const context=requireAuth(req,res);
  if(!context)return;
  if(req.method!=="POST"&&req.method!=="DELETE")return res.status(405).json({error:"Method not allowed"});
  try{
    const rows=await supabaseFetch("outlook_connections?organisation_id=eq."+encodeURIComponent(context.organisationId)+"&status=eq.connected&select=*&limit=1");
    const connection=rows[0];
    if(!connection)return res.status(200).json({ok:true,connected:false});
    if(connection.subscription_id){
      try{
        const token=await getAccessToken(connection);
        await graphDelete("/subscriptions/"+encodeURIComponent(connection.subscription_id),token);
      }catch(error){console.warn("Unable to delete Outlook subscription during disconnect",error);}
    }
    await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(connection.id),{method:"PATCH",body:JSON.stringify({status:"disconnected",subscription_id:null,subscription_expires_at:null,client_state:null,updated_at:new Date().toISOString()})});
    return res.status(200).json({ok:true,connected:false});
  }catch(error){return res.status(500).json({ok:false,error:error.message||"Unable to disconnect Outlook."});}
}

export async function webhook(req,res){
  // Microsoft Graph validates a notification endpoint with a validationToken
  // query parameter before it starts delivering change notifications.
  const validationToken=String(req.query?.validationToken||"");
  if(validationToken){
    res.setHeader("Content-Type","text/plain; charset=utf-8");
    return res.status(200).send(validationToken);
  }
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});

  const notifications=Array.isArray(req.body?.value)?req.body.value:[];
  if(!notifications.length)return res.status(202).json({ok:true,processed:0});

  let queued=0,duplicates=0;
  const failures=[];
  for(const notification of notifications){
    try{
      const subscriptionId=String(notification?.subscriptionId||"").trim();
      const clientState=String(notification?.clientState||"").trim();
      if(!subscriptionId)throw new Error("Outlook notification is missing subscriptionId.");

      const connections=await supabaseFetch(
        "outlook_connections?subscription_id=eq."+encodeURIComponent(subscriptionId)+"&status=eq.connected&select=*&limit=1"
      );
      const connection=Array.isArray(connections)?connections[0]:null;
      if(!connection)throw new Error("No connected Outlook account matches subscription "+subscriptionId+".");
      if(!clientState||clientState!==String(connection.client_state||""))throw new Error("Outlook notification clientState did not match the active subscription.");

      const messageIdFromNotification=String(notification?.resourceData?.id||"").trim();
      if(!messageIdFromNotification)throw new Error("Outlook notification is missing the message id.");
      const inserted=await enqueueWebhookEvent({connection,subscriptionId,graphMessageId:messageIdFromNotification,notification});
      if(inserted)queued++;else duplicates++;
    }catch(error){
      failures.push(error.message||"Unknown webhook failure");
      console.error("Outlook webhook notification queue failed",error);
    }
  }
  if(failures.length)return res.status(503).json({ok:false,queued,duplicates,failures});
  return res.status(202).json({ok:true,queued,duplicates});
}

async function renew(req,res){
  if(req.method!=="GET"&&req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(!authorizeCron(req,res))return;
  try{
    const rows=await supabaseFetch("outlook_connections?select=*&status=eq.connected&order=updated_at.asc");
    if(!rows.length)return res.status(200).json({ok:true,renewed:0,message:"No Outlook connections configured."});
    const results=[];
    for(const connection of rows){
      try{results.push(await renewConnection(connection));}
      catch(error){
        const message=error.message||"Unable to renew Outlook subscription.";
        await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(connection.id),{method:"PATCH",body:JSON.stringify({last_renewal_error:message,updated_at:new Date().toISOString()})}).catch(()=>{});
        results.push({email:connection.email,ok:false,error:message});
      }
    }
    const failed=results.filter(result=>!result.ok);
    return res.status(failed.length?207:200).json({ok:failed.length===0,renewed:results.filter(result=>result.ok).length,failed:failed.length,results});
  }catch(error){
    console.error("Outlook subscription renewal failed",error);
    return res.status(500).json({ok:false,error:error.message||"Unable to renew Outlook subscription."});
  }
}

async function renewConnection(connection){
  const accessToken=await getAccessToken(connection);
  const clientState=connection.client_state||crypto.randomBytes(24).toString("hex");
  const expirationDateTime=new Date(Date.now()+2*24*60*60*1000).toISOString();
  const notificationUrl=getWebhookUrl();
  let subscription=null;
  if(connection.subscription_id){
    try{
      subscription=await graphPatch("/subscriptions/"+encodeURIComponent(connection.subscription_id),accessToken,{expirationDateTime,notificationUrl});
    }catch(error){
      // Microsoft Graph returns 404 after it removes an expired subscription.
      if(error.status!==404)throw error;
    }
  }
  if(!subscription)subscription=await graphPost("/subscriptions",accessToken,{changeType:"created",notificationUrl,resource:"me/mailFolders('Inbox')/messages",expirationDateTime,clientState});
  const renewedAt=new Date().toISOString();
  try{
    await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(connection.id),{method:"PATCH",body:JSON.stringify({subscription_id:subscription.id,subscription_expires_at:subscription.expirationDateTime,client_state:clientState,last_renewed_at:renewedAt,last_renewal_error:null,updated_at:renewedAt})});
  }catch(error){
    await graphDelete("/subscriptions/"+encodeURIComponent(subscription.id),accessToken).catch(()=>{});
    throw error;
  }
  if(connection.subscription_id&&connection.subscription_id!==subscription.id){
    await graphDelete("/subscriptions/"+encodeURIComponent(connection.subscription_id),accessToken).catch(error=>console.warn("Unable to remove replaced Outlook subscription",error));
  }
  console.info("Outlook subscription renewed", {email:connection.email,subscriptionId:subscription.id,expiresAt:subscription.expirationDateTime});
  return {email:connection.email,ok:true,subscriptionId:subscription.id,expiresAt:subscription.expirationDateTime};
}

async function processWebhook(req,res){
  if(req.method!=="GET"&&req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  if(!authorizeCron(req,res))return;

  const summary={syncRuns:0,queued:0,processed:0,failed:0};
  try{
    summary.syncRuns=await startQueuedSyncRuns(summary);
    const events=await supabaseFetch("rpc/claim_outlook_webhook_events",{method:"POST",body:JSON.stringify({p_limit:25})});
    for(const event of (Array.isArray(events)?events:[])){
      try{
        await processWebhookEvent(event);
        summary.processed++;
      }catch(error){
        await recordWebhookEventFailure(event,error);
        summary.failed++;
      }
      if(event.sync_run_id)await refreshSyncRun(event.sync_run_id);
    }
    return res.status(200).json({ok:true,...summary});
  }catch(error){
    console.error("Outlook webhook processor failed",error);
    return res.status(500).json({ok:false,error:error.message||"Outlook webhook processing failed.",...summary});
  }
}

function authorizeCron(req,res){
  const cronSecret=String(process.env.CRON_SECRET||"").trim();
  if(!cronSecret){res.status(503).json({error:"CRON_SECRET is not configured."});return false;}
  const supplied=String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim();
  if(supplied.length!==cronSecret.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(cronSecret))){res.status(401).json({error:"Unauthorized"});return false;}
  return true;
}

async function startQueuedSyncRuns(summary){
  const runs=await supabaseFetch("outlook_sync_runs?status=eq.queued&order=created_at.asc&limit=5");
  let started=0;
  for(const run of (Array.isArray(runs)?runs:[])){
    const claimed=await supabaseFetch("outlook_sync_runs?id=eq."+encodeURIComponent(run.id)+"&status=eq.queued",{method:"PATCH",body:JSON.stringify({status:"running",started_at:new Date().toISOString(),updated_at:new Date().toISOString()}),headers:{Prefer:"return=representation"}});
    if(!Array.isArray(claimed)||!claimed[0])continue;
    started++;
    try{
      const connections=await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(run.connection_id)+"&status=eq.connected&limit=1");
      const connection=connections[0];
      if(!connection)throw new Error("The connected Outlook inbox is no longer available.");
      const token=await getAccessToken(connection);
      const messages=await getInboxMessages(token);
      let queued=0,duplicates=0;
      for(const message of messages.filter(item=>/CUSTOMS-IDP/i.test(String(item.subject||"")))){
        const inserted=await enqueueWebhookEvent({connection,subscriptionId:connection.subscription_id||("manual:"+connection.id),graphMessageId:String(message.id||""),notification:{source:"manual",messageId:message.id,receivedDateTime:message.receivedDateTime||null},syncRunId:run.id});
        if(inserted)queued++;else duplicates++;
      }
      await supabaseFetch("outlook_sync_runs?id=eq."+encodeURIComponent(run.id),{method:"PATCH",body:JSON.stringify({checked:messages.length,queued,duplicates,updated_at:new Date().toISOString()})});
      if(queued===0){
        const finishedAt=new Date().toISOString();
        await supabaseFetch("outlook_sync_runs?id=eq."+encodeURIComponent(run.id),{method:"PATCH",body:JSON.stringify({status:"completed",finished_at:finishedAt,updated_at:finishedAt})});
        await updateConnectionSync(connection.id,{last_sync_started_at:run.started_at||finishedAt,last_sync_status:"completed",last_sync_error:null,last_sync_checked:messages.length,last_sync_queued:0,last_sync_duplicates:duplicates,last_sync_processed:0,last_sync_failed:0,last_sync_completed_at:finishedAt});
      }else await updateConnectionSync(connection.id,{last_sync_started_at:run.started_at||new Date().toISOString(),last_sync_status:"running",last_sync_error:null,last_sync_checked:messages.length,last_sync_queued:queued,last_sync_duplicates:duplicates,last_sync_failed:0});
    }catch(error){
      await supabaseFetch("outlook_sync_runs?id=eq."+encodeURIComponent(run.id),{method:"PATCH",body:JSON.stringify({status:"failed",error:error.message||"Mailbox sync failed.",finished_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
      await updateConnectionSync(run.connection_id,{last_sync_status:"failed",last_sync_error:error.message||"Mailbox sync failed.",last_sync_completed_at:new Date().toISOString()});
    }
  }
  return started;
}

async function processWebhookEvent(event){
  const connections=await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(event.connection_id)+"&limit=1");
  const connection=connections[0];
  if(!connection)throw new Error("Outlook connection for queued notification was not found.");
  const token=await getAccessToken(connection);
  const message=await graphGet("/me/messages/"+encodeURIComponent(event.graph_message_id)+"?$select=id,internetMessageId,subject,body,from,toRecipients,receivedDateTime,hasAttachments",token);
  if(!/CUSTOMS-IDP/i.test(String(message.subject||""))){
    await markWebhookEventCompleted(event);
    return;
  }
  const internetMessageId=String(message.internetMessageId||"").trim()||null;
  const ticket=message.id?"GRAPH:"+String(message.id):(internetMessageId||"");
  const existing=await findExistingEmailPack({ticket,messageId:internetMessageId,subject:message.subject||"",receivedAt:message.receivedDateTime||"",from:message.from?.emailAddress?.address||""});
  if(existing){
    await markWebhookEventCompleted(event);
    return;
  }
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
    attachments
  });
  await markWebhookEventCompleted(event);
}

async function enqueueWebhookEvent({connection,subscriptionId,graphMessageId,notification,syncRunId=null}){
  if(!graphMessageId)throw new Error("Outlook notification is missing the message id.");
  const rows=await supabaseFetch("outlook_webhook_events",{method:"POST",body:JSON.stringify({organisation_id:connection.organisation_id||"demo-organisation",connection_id:connection.id,subscription_id:subscriptionId,graph_message_id:graphMessageId,sync_run_id:syncRunId,notification,status:"pending"}),headers:{Prefer:"resolution=ignore-duplicates,return=representation"}});
  return Array.isArray(rows)&&rows.length>0;
}

async function markWebhookEventCompleted(event){
  await supabaseFetch("outlook_webhook_events?id=eq."+encodeURIComponent(event.id),{method:"PATCH",body:JSON.stringify({status:"completed",locked_until:null,last_error:null,processed_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
}

async function recordWebhookEventFailure(event,error){
  const attempts=Number(event.attempts)||1;
  const terminal=attempts>=5;
  await supabaseFetch("outlook_webhook_events?id=eq."+encodeURIComponent(event.id),{method:"PATCH",body:JSON.stringify({status:terminal?"failed":"pending",available_at:new Date(Date.now()+(terminal?0:Math.min(60,2**attempts)*60*1000)).toISOString(),locked_until:null,last_error:error?.message||"Webhook processing failed.",updated_at:new Date().toISOString()})});
}

async function refreshSyncRun(id){
  const events=await supabaseFetch("outlook_webhook_events?sync_run_id=eq."+encodeURIComponent(id)+"&select=status,last_error");
  const rows=Array.isArray(events)?events:[];
  const pending=rows.filter(event=>event.status==="pending"||event.status==="processing").length;
  const processed=rows.filter(event=>event.status==="completed").length;
  const failed=rows.filter(event=>event.status==="failed").length;
  const updates={processed,failed,updated_at:new Date().toISOString()};
  if(!pending){
    updates.status=failed?"failed":"completed";
    updates.error=failed?rows.find(event=>event.status==="failed")?.last_error||"One or more messages failed.":null;
    updates.finished_at=new Date().toISOString();
  }else updates.status="running";
  await supabaseFetch("outlook_sync_runs?id=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(updates)});
  const runRows=await supabaseFetch("outlook_sync_runs?id=eq."+encodeURIComponent(id)+"&select=connection_id,status,error,checked,queued,processed,duplicates,failed&limit=1");
  const run=runRows[0];
  if(run)await updateConnectionSync(run.connection_id,{last_sync_status:run.status,last_sync_error:run.error||null,last_sync_checked:run.checked,last_sync_queued:run.queued,last_sync_processed:run.processed,last_sync_duplicates:run.duplicates,last_sync_failed:run.failed,last_sync_completed_at:updates.finished_at||null});
}

async function updateConnectionSync(id,updates){
  await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({...updates,updated_at:new Date().toISOString()})}).catch(error=>console.error("Unable to update Outlook sync status",error));
}

export function getWebhookUrl(){
  const configured=String(process.env.OUTLOOK_WEBHOOK_URL||"").trim();
  if(configured)return configured;
  if(process.env.VERCEL_URL)return "https://"+String(process.env.VERCEL_URL).trim()+"/api/outlook/webhook";
  throw new Error("OUTLOOK_WEBHOOK_URL is required for local Outlook testing.");
}

function getRedirectUri(){
  const configured=String(process.env.OUTLOOK_REDIRECT_URI||"").trim();
  if(configured)return configured;
  const appUrl=String(process.env.APP_URL||"").trim();
  if(appUrl)return appUrl.replace(/\/+$/,"")+"/api/outlook/callback";
  if(process.env.VERCEL_URL)return "https://"+String(process.env.VERCEL_URL).trim()+"/api/outlook/callback";
  return "http://localhost:3000/api/outlook/callback";
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
    if(Array.isArray(byTicket)&&byTicket[0])return byTicket[0];
  }
  if(messageId){
    const byMessage=await supabaseFetch("document_packs?extracted_data->email->>messageId=eq."+encodeURIComponent(messageId)+"&select=id,docs,extracted_data&limit=1").catch(()=>[]);
    if(Array.isArray(byMessage)&&byMessage[0])return byMessage[0];
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
  const appUrl=String(process.env.APP_URL||"").trim();
  const base=appUrl||("https://"+String(process.env.VERCEL_URL||"").trim());
  if(!base||base==="https://")throw new Error("APP_URL or VERCEL_URL is required for internal email ingestion.");
  const response=await fetch(base.replace(/\/+$/g,"")+"/api/email-ingest",{method:"POST",headers:{"Content-Type":"application/json","x-email-ingest-secret":String(process.env.EMAIL_INGEST_SECRET||"")},body:JSON.stringify(payload)});
  if(!response.ok)throw new Error("Email ingestion returned HTTP "+response.status+": "+await response.text());
}
async function graphGet(path,token){
  const target=/^https:\/\//i.test(String(path))?String(path):GRAPH+path;
  const response=await fetch(target,{headers:{Authorization:"Bearer "+token}});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error?.message||"Microsoft Graph request failed.");
  return data;
}
async function getInboxMessages(token){
  const messages=[];
  let next="/me/mailFolders('Inbox')/messages?$top=50&$orderby=receivedDateTime%20desc&$select=id,internetMessageId,subject,receivedDateTime";
  while(next){
    const page=await graphGet(next,token);
    if(Array.isArray(page.value))messages.push(...page.value);
    next=String(page["@odata.nextLink"]||"").trim()||null;
  }
  return messages;
}
async function graphPost(path,token,body){
  const response=await fetch(GRAPH+path,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error?.message||"Graph subscription failed.");
  return data;
}
async function graphPatch(path,token,body){
  const response=await fetch(GRAPH+path,{method:"PATCH",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok){
    const error=new Error(data?.error?.message||"Graph subscription renewal failed.");
    error.status=response.status;
    throw error;
  }
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
  if(!text)return [];
  const parsed=JSON.parse(text);
  // PostgREST normally returns arrays for collection reads, but keep the
  // intake path defensive so an unexpected null response cannot break the
  // mailbox sync before the Inbox is refreshed.
  if(parsed===null)return [];
  return parsed;
}
