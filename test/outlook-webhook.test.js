import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const encryptionKey=Buffer.alloc(32,7);
process.env.SUPABASE_URL="https://supabase.test";
process.env.SUPABASE_SERVICE_ROLE_KEY="service-role-test";
process.env.OUTLOOK_CLIENT_ID="client-test";
process.env.OUTLOOK_CLIENT_SECRET="secret-test";
process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY=encryptionKey.toString("base64");
process.env.EMAIL_INGEST_SECRET="ingest-test";
process.env.APP_URL="https://customs-idp.test";
process.env.CRON_SECRET="cron-test";

function encryptRefreshToken(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",encryptionKey,iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}

function response(){return {statusCode:200,body:null,headers:{},status(code){this.statusCode=code;return this;},setHeader(name,value){this.headers[name]=value;},json(value){this.body=value;return this;},send(value){this.body=value;return this;}};}
const cronHeaders={authorization:"Bearer cron-test"};

test("Outlook webhook echoes POST validation tokens as plain text",async()=>{
  const {webhook}=await import("../src/server/api/outlook.js");
  const res=response();
  await webhook({method:"POST",body:{},query:{validationToken:"graph-validation-token"}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.headers["Content-Type"],"text/plain; charset=utf-8");
  assert.equal(res.body,"graph-validation-token");
});

test("Outlook webhook validates and queues without doing Graph or ingestion work",async()=>{
  const connection={id:"connection-1",organisation_id:"org-1",subscription_id:"subscription-1",client_state:"state-1",refresh_token:encryptRefreshToken("refresh-token")};
  const externalCalls=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const target=String(url);
    if(target.startsWith(process.env.SUPABASE_URL+"/rest/v1/outlook_connections?subscription_id="))return new Response(JSON.stringify([connection]),{status:200});
    if(target===process.env.SUPABASE_URL+"/rest/v1/outlook_webhook_events")return new Response(JSON.stringify([{id:"event-1",status:"pending"}]),{status:201});
    externalCalls.push({target,options});
    throw new Error("Unexpected fetch: "+target);
  };

  try{
    const {webhook}=await import("../src/server/api/outlook.js");
    const res=response();
    await webhook({method:"POST",body:{value:[{subscriptionId:"subscription-1",clientState:"state-1",resourceData:{id:"graph-message-1"}}]},query:{}},res);
    assert.equal(res.statusCode,202);
    assert.equal(res.body.queued,1);
    assert.equal(res.body.duplicates,0);
    assert.deepEqual(externalCalls,[]);
  } finally {
    globalThis.fetch=originalFetch;
  }
});

test("queue worker completes a matching webhook event",async()=>{
  const connection={id:"connection-1",organisation_id:"org-1",email:"inbox@example.test",refresh_token:encryptRefreshToken("refresh-token")};
  const completed=[];
  let ingestedPayload=null;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const target=String(url);
    if(target.includes("/outlook_sync_runs?status=eq.queued"))return new Response("[]",{status:200});
    if(target.endsWith("/rpc/claim_outlook_webhook_events"))return new Response(JSON.stringify([{id:"event-1",connection_id:"connection-1",graph_message_id:"message-1",attempts:1,sync_run_id:null}]),{status:200});
    if(target.includes("/outlook_connections?id=eq.connection-1"))return new Response(JSON.stringify([connection]),{status:200});
    if(target==="https://login.microsoftonline.com/common/oauth2/v2.0/token")return new Response(JSON.stringify({access_token:"graph-token"}),{status:200});
    if(target.includes("graph.microsoft.com/v1.0/me/messages/message-1"))return new Response(JSON.stringify({id:"message-1",internetMessageId:"internet-1",subject:"CUSTOMS-IDP invoice",body:{content:"Invoice attached"},from:{emailAddress:{address:"sender@example.test"}},toRecipients:[{emailAddress:{address:"inbox@example.test"}}],receivedDateTime:"2026-10-02T10:00:00.000Z",hasAttachments:false}),{status:200});
    if(target.includes("/document_packs?"))return new Response("[]",{status:200});
    if(target==="https://customs-idp.test/api/email-ingest"){ingestedPayload=JSON.parse(options.body);return new Response("{}",{status:200});}
    if(target.includes("/outlook_webhook_events?id=eq.event-1")){completed.push(JSON.parse(options.body));return new Response(null,{status:204});}
    throw new Error("Unexpected fetch: "+target);
  };
  try{
    const {default:handler}=await import("../src/server/api/outlook.js");
    const res=response();
    await handler({method:"POST",url:"/api/outlook?action=process-webhook",query:{action:"process-webhook"},headers:cronHeaders},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.processed,1);
    assert.equal(res.body.failed,0);
    assert.equal(completed[0].status,"completed");
    assert.equal(ingestedPayload.messageId,"internet-1");
  }finally{globalThis.fetch=originalFetch;}
});

test("queue worker records a terminal failure after the retry limit",async()=>{
  const connection={id:"connection-1",refresh_token:encryptRefreshToken("refresh-token")};
  let failureUpdate=null;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const target=String(url);
    if(target.includes("/outlook_sync_runs?status=eq.queued"))return new Response("[]",{status:200});
    if(target.endsWith("/rpc/claim_outlook_webhook_events"))return new Response(JSON.stringify([{id:"event-1",connection_id:"connection-1",graph_message_id:"message-1",attempts:5,sync_run_id:null}]),{status:200});
    if(target.includes("/outlook_connections?id=eq.connection-1"))return new Response(JSON.stringify([connection]),{status:200});
    if(target==="https://login.microsoftonline.com/common/oauth2/v2.0/token")return new Response(JSON.stringify({access_token:"graph-token"}),{status:200});
    if(target.includes("graph.microsoft.com/v1.0/me/messages/message-1"))return new Response(JSON.stringify({error:{message:"Message unavailable"}}),{status:503});
    if(target.includes("/outlook_webhook_events?id=eq.event-1")){failureUpdate=JSON.parse(options.body);return new Response(null,{status:204});}
    throw new Error("Unexpected fetch: "+target);
  };
  try{
    const {default:handler}=await import("../src/server/api/outlook.js");
    const res=response();
    await handler({method:"POST",url:"/api/outlook?action=process-webhook",query:{action:"process-webhook"},headers:cronHeaders},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.failed,1);
    assert.equal(failureUpdate.status,"failed");
    assert.equal(failureUpdate.last_error,"Message unavailable");
  }finally{globalThis.fetch=originalFetch;}
});

test("queue worker schedules a failed event for retry before the limit",async()=>{
  const connection={id:"connection-1",refresh_token:encryptRefreshToken("refresh-token")};
  let retryUpdate=null;
  const before=Date.now();
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const target=String(url);
    if(target.includes("/outlook_sync_runs?status=eq.queued"))return new Response("[]",{status:200});
    if(target.endsWith("/rpc/claim_outlook_webhook_events"))return new Response(JSON.stringify([{id:"event-1",connection_id:"connection-1",graph_message_id:"message-1",attempts:2,sync_run_id:null}]),{status:200});
    if(target.includes("/outlook_connections?id=eq.connection-1"))return new Response(JSON.stringify([connection]),{status:200});
    if(target==="https://login.microsoftonline.com/common/oauth2/v2.0/token")return new Response(JSON.stringify({access_token:"graph-token"}),{status:200});
    if(target.includes("graph.microsoft.com/v1.0/me/messages/message-1"))return new Response(JSON.stringify({error:{message:"Temporary Graph failure"}}),{status:503});
    if(target.includes("/outlook_webhook_events?id=eq.event-1")){retryUpdate=JSON.parse(options.body);return new Response(null,{status:204});}
    throw new Error("Unexpected fetch: "+target);
  };
  try{
    const {default:handler}=await import("../src/server/api/outlook.js");
    const res=response();
    await handler({method:"POST",url:"/api/outlook?action=process-webhook",query:{action:"process-webhook"},headers:cronHeaders},res);
    assert.equal(res.statusCode,200);
    assert.equal(retryUpdate.status,"pending");
    assert.equal(retryUpdate.last_error,"Temporary Graph failure");
    assert.ok(new Date(retryUpdate.available_at).getTime()>before);
  }finally{globalThis.fetch=originalFetch;}
});

test("manual sync follows Graph pagination and records aggregate progress",async()=>{
  const connection={id:"connection-1",organisation_id:"org-1",subscription_id:"subscription-1",refresh_token:encryptRefreshToken("refresh-token")};
  let inserted=0;
  let progress=null;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const target=String(url);
    if(target.includes("/outlook_sync_runs?status=eq.queued"))return new Response(JSON.stringify([{id:"run-1",connection_id:"connection-1",status:"queued"}]),{status:200});
    if(target.includes("/outlook_sync_runs?id=eq.run-1&status=eq.queued"))return new Response(JSON.stringify([{id:"run-1",connection_id:"connection-1",status:"running",started_at:"2026-10-04T10:00:00.000Z"}]),{status:200});
    if(target.includes("/outlook_connections?id=eq.connection-1&status=eq.connected"))return new Response(JSON.stringify([connection]),{status:200});
    if(target==="https://login.microsoftonline.com/common/oauth2/v2.0/token")return new Response(JSON.stringify({access_token:"graph-token"}),{status:200});
    if(target.includes("graph.microsoft.com/v1.0/me/mailFolders('Inbox')/messages?"))return new Response(JSON.stringify({value:[{id:"message-1",subject:"CUSTOMS-IDP first"}],"@odata.nextLink":"https://graph.microsoft.com/v1.0/next-page"}),{status:200});
    if(target==="https://graph.microsoft.com/v1.0/next-page")return new Response(JSON.stringify({value:[{id:"message-2",subject:"ordinary email"},{id:"message-3",subject:"CUSTOMS-IDP second"}]}),{status:200});
    if(target.endsWith("/outlook_webhook_events")){inserted++;return new Response(JSON.stringify([{id:"event-"+inserted}]),{status:201});}
    if(target.includes("/outlook_sync_runs?id=eq.run-1")&&options.method==="PATCH"){progress=JSON.parse(options.body);return new Response(null,{status:204});}
    if(target.includes("/outlook_connections?id=eq.connection-1")&&options.method==="PATCH")return new Response(null,{status:204});
    if(target.endsWith("/rpc/claim_outlook_webhook_events"))return new Response("[]",{status:200});
    throw new Error("Unexpected fetch: "+target);
  };
  try{
    const {default:handler}=await import("../src/server/api/outlook.js");
    const res=response();
    await handler({method:"POST",url:"/api/outlook?action=process-webhook",query:{action:"process-webhook"},headers:cronHeaders},res);
    assert.equal(res.statusCode,200);
    assert.equal(inserted,2);
    assert.equal(progress.checked,3);
    assert.equal(progress.queued,2);
  }finally{globalThis.fetch=originalFetch;}
});

test("renewal persists the replacement before deleting the old subscription",async()=>{
  const connection={id:"connection-1",email:"inbox@example.test",subscription_id:"old-subscription",client_state:"state-1",refresh_token:encryptRefreshToken("refresh-token")};
  const order=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const target=String(url);
    if(target.includes("/outlook_connections?select=*&status=eq.connected"))return new Response(JSON.stringify([connection]),{status:200});
    if(target==="https://login.microsoftonline.com/common/oauth2/v2.0/token")return new Response(JSON.stringify({access_token:"graph-token"}),{status:200});
    if(target==="https://graph.microsoft.com/v1.0/subscriptions"&&options.method==="POST"){order.push("create");return new Response(JSON.stringify({id:"new-subscription",expirationDateTime:"2026-10-06T10:00:00.000Z"}),{status:201});}
    if(target.includes("/outlook_connections?id=eq.connection-1")&&options.method==="PATCH"){order.push("persist");return new Response(null,{status:204});}
    if(target.endsWith("/subscriptions/old-subscription")&&options.method==="DELETE"){order.push("delete-old");return new Response(null,{status:204});}
    throw new Error("Unexpected fetch: "+target);
  };
  try{
    const {default:handler}=await import("../src/server/api/outlook.js");
    const res=response();
    await handler({method:"POST",url:"/api/outlook?action=renew",query:{action:"renew"},headers:cronHeaders},res);
    assert.equal(res.statusCode,200);
    assert.deepEqual(order,["create","persist","delete-old"]);
  }finally{globalThis.fetch=originalFetch;}
});
