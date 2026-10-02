import test from "node:test";
import assert from "node:assert/strict";
import { runAutomatedEmailAudit } from "../src/services/agentService.js";

test("automated email audit marks a pack complete when no suggestions are returned", async()=>{
  const originalFetch=globalThis.fetch;
  let request;
  globalThis.fetch=async(url,options)=>{
    request={url,options};
    return new Response(JSON.stringify({action:"no_changes"}),{status:200,headers:{"Content-Type":"application/json"}});
  };
  const pack={id:"PK-1",customer:"Acme Components Ltd",email:{subject:"Customs documents"},extractedData:{invoiceNumber:"INV-1"}};
  try{
    const result=await runAutomatedEmailAudit(pack);
    assert.equal(request.url,"/api/agent");
    assert.equal(request.options.method,"POST");
    assert.equal(JSON.parse(request.options.body).pack.id,"PK-1");
    assert.equal(result.extractedData.agentAuditCompleted,true);
  } finally {
    globalThis.fetch=originalFetch;
  }
});
