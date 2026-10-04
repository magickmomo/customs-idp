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

function encryptRefreshToken(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",encryptionKey,iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}

test("Outlook webhook ingests a matching notification without an undefined repair variable",async()=>{
  const connection={id:"connection-1",subscription_id:"subscription-1",client_state:"state-1",refresh_token:encryptRefreshToken("refresh-token")};
  let ingestedPayload=null;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const target=String(url);
    if(target.startsWith(process.env.SUPABASE_URL+"/rest/v1/outlook_connections?subscription_id="))return new Response(JSON.stringify([connection]),{status:200});
    if(target===process.env.SUPABASE_URL+"/rest/v1/outlook_webhook_events")return new Response(JSON.stringify([{id:"event-1",status:"pending"}]),{status:201});
    if(target.startsWith(process.env.SUPABASE_URL+"/rest/v1/document_packs?"))return new Response("[]",{status:200});
    if(target==="https://login.microsoftonline.com/consumers/oauth2/v2.0/token")return new Response(JSON.stringify({access_token:"graph-token"}),{status:200});
    if(target.startsWith("https://graph.microsoft.com/v1.0/me/messages/"))return new Response(JSON.stringify({id:"graph-message-1",internetMessageId:"internet-message-1",subject:"CUSTOMS-IDP invoice",body:{content:"Invoice attached",contentType:"text"},from:{emailAddress:{address:"sender@example.test"}},toRecipients:[{emailAddress:{address:"customs@example.test"}}],receivedDateTime:"2026-10-02T10:00:00.000Z",hasAttachments:false}),{status:200});
    if(target==="https://customs-idp.vercel.app/api/email-ingest"){
      ingestedPayload=JSON.parse(options.body);
      return new Response("{}",{status:200});
    }
    throw new Error("Unexpected fetch: "+target);
  };

  try{
    const {webhook}=await import("../src/server/api/outlook.js");
    const response={statusCode:200,body:null,headers:{},status(code){this.statusCode=code;return this;},setHeader(name,value){this.headers[name]=value;},json(value){this.body=value;return this;}};
    await webhook({method:"POST",body:{value:[{subscriptionId:"subscription-1",clientState:"state-1",resourceData:{id:"graph-message-1"}}]},query:{}},response);
    assert.equal(response.statusCode,202);
    assert.equal(response.body.queued,1);
    assert.equal(response.body.duplicates,0);
    assert.equal(ingestedPayload,null);
  } finally {
    globalThis.fetch=originalFetch;
  }
});
