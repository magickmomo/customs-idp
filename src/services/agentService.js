import { buildWorkingCustomsRecord } from "../domain/workingRecord.js";
import { getCustomerStrategy } from "../domain/packData.js";

async function runAutomatedEmailAudit(pack){
  if(!pack?.email||!pack?.extractedData)return pack;
  const existing=Array.isArray(pack.extractedData.agentMessages)?pack.extractedData.agentMessages:[];
  if(pack.extractedData?.agentAuditCompleted)return pack;
  const response=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    message:"[AUTOMATED EMAIL AUDIT] Review the associated email against the extracted document data and the combined working customs record before the user opens the pack. Identify clear customs-relevant information present in the email but missing from the extracted/combined data, including any HS/commodity-code information. Do not change the pack; return suggestions requiring human confirmation. If there is no clear additional information, return no suggestions.",
    pack:{...pack,customerStrategy:getCustomerStrategy(pack.customer),conversation:[],workingRecord:pack.workingRecord||buildWorkingCustomsRecord(pack),extractedData:{...(pack.extractedData||{}),agentMessages:undefined}}
  })});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||"Automated agent review failed");
  if(result.action!=="suggest_field_updates"||!Array.isArray(result.suggestions)||!result.suggestions.length)return {...pack,extractedData:{...pack.extractedData,agentAuditCompleted:true}};
  const suggestionMessage={type:"fieldSuggestion",text:result.reply||"I found additional customs information in the email that is missing from the extracted data. Review the suggestions below and confirm whether to add them.",suggestions:result.suggestions,handled:null,persist:true};
  const data=JSON.parse(JSON.stringify(pack.extractedData||{}));
  data.agentMessages=[...existing,suggestionMessage];
  return {...pack,extractedData:{...data,agentAuditCompleted:true}};
}

export { runAutomatedEmailAudit };
