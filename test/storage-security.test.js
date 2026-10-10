import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import handler from "../src/server/api/storage.js";
import { createAuthCookie } from "../src/server/api/authGuard.js";

function response(){return {statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};}

async function withEnv(run){
  const original={IDP_AUTH_SECRET:process.env.IDP_AUTH_SECRET,SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.IDP_AUTH_SECRET="storage-security-test";
  process.env.SUPABASE_URL="https://supabase.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY="service-test";
  try{return await run();}finally{for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}

function request(body,method="POST"){
  const cookie=createAuthCookie({organisationId:"org-safe",userId:"user-1"},{secure:false}).split(";")[0];
  return {method,headers:{cookie},body,query:body};
}

test("storage API never signs an arbitrary client path",async()=>withEnv(async()=>{
  let called=false;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{called=true;throw new Error("network must not be called");};
  try{
    const res=response();
    await handler(request({action:"signed-url",path:"another-tenant/secret.pdf"}),res);
    assert.equal(res.statusCode,400);
    assert.equal(called,false);
  }finally{globalThis.fetch=originalFetch;}
}));

test("storage GET cannot generate document links",async()=>withEnv(async()=>{
  const res=response();
  await handler(request({path:"another-tenant/secret.pdf"},"GET"),res);
  assert.equal(res.statusCode,405);
}));

test("pack listing requires an organisation-owned pack",async()=>withEnv(async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json([]);
  try{
    const res=response();
    await handler(request({action:"list-pack",packId:"PK-OTHER"}),res);
    assert.equal(res.statusCode,404);
  }finally{globalThis.fetch=originalFetch;}
}));

test("persisted metadata outside the owned pack namespace is never signed",async()=>withEnv(async()=>{
  const originalFetch=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{
    calls+=1;
    if(calls===1)return Response.json([{id:"PK-1",pack_uuid:"pack-uuid",extracted_data:{_manager:{uploadedFiles:[{id:"file-1",storagePath:"organisations/org-other/packs/secret/file.pdf"}]}}}]);
    throw new Error("storage signing must not be reached");
  };
  try{
    const res=response();
    await handler(request({action:"signed-url",packId:"PK-1",fileId:"file-1"}),res);
    assert.equal(res.statusCode,403);
    assert.equal(calls,1);
  }finally{globalThis.fetch=originalFetch;}
}));

test("email ingest secret is not accepted as general API authentication",async()=>withEnv(async()=>{
  process.env.EMAIL_INGEST_SECRET="connector-secret";
  const res=response();
  await handler({method:"POST",headers:{"x-email-ingest-secret":"connector-secret"},body:{action:"signed-url",packId:"PK-1",fileId:crypto.randomUUID()}},res);
  assert.equal(res.statusCode,401);
}));

test("authenticated APIs fail closed when the cookie signing secret is missing",async()=>withEnv(async()=>{
  const cookie=createAuthCookie({organisationId:"org-safe",userId:"user-1"},{secure:false}).split(";")[0];
  delete process.env.IDP_AUTH_SECRET;
  const res=response();
  await handler({method:"POST",headers:{cookie},body:{action:"list-pack",packId:"PK-1"}},res);
  assert.equal(res.statusCode,503);
  assert.match(res.body.error,/IDP_AUTH_SECRET/);
}));
