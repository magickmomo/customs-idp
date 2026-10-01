import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { extractDocument } from "../src/document-extraction.js";
import { DEFAULT_ORGANISATION } from "../src/tenant.js";

const DEFAULT_STRATEGIES = {
  "Acme Components Ltd": { emailFields: [] },
  "Northstar Manufacturing": { emailFields: [] },
  "Bancale Trading": { emailFields: [] },
  "Raven Industrial": { emailFields: [] }
};

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});

  const secret=process.env.EMAIL_INGEST_SECRET;
  if(!secret) return res.status(500).json({error:"EMAIL_INGEST_SECRET is not configured in Vercel."});
  const supplied=String(req.headers["x-email-ingest-secret"]||"");
  if(!supplied || !safeEqual(supplied,secret)) return res.status(401).json({error:"Invalid email ingestion secret."});

  try{
    const body=req.body||{};
    const to=String(body.to||"").trim().toLowerCase();
    const from=String(body.from||"").trim();
    const subject=String(body.subject||"").trim();
    const text=String(body.text||body.body||"");
    const html=String(body.html||"");
    const messageId=String(body.messageId||body.message_id||"").trim()||null;
    const ingestTicket=String(body.ticket||"").trim()||null;
    const receivedAt=body.receivedAt||body.received_at||new Date().toISOString();
    const attachments=Array.isArray(body.attachments)?body.attachments:[];
    const repair=Boolean(body.repair);

    if(!to) return res.status(400).json({error:"to is required."});

    const routing=readJson(process.env.CUSTOMER_EMAIL_ROUTING_JSON,{});
    const customer=routing[to]?.customer || String(body.customer||"").trim() || "Unassigned customer";
    const strategy=readJson(process.env.CUSTOMER_EMAIL_STRATEGIES_JSON,{});
    const configured=strategy[customer] || DEFAULT_STRATEGIES[customer] || {emailFields:[]};
    const emailFields=Array.isArray(configured.emailFields)?configured.emailFields.filter(Boolean):[];

    const ticket=ingestTicket||messageId||("EMAIL-"+Date.now().toString().slice(-6));
    let id="PK-EMAIL-"+Date.now().toString(36).toUpperCase();
    const existingByTicket=await supabaseFetch("document_packs?ticket=eq."+encodeURIComponent(ticket)+"&select=id,customer,status,docs&limit=1");
    const existingByMessage=messageId
      ? await supabaseFetch("document_packs?extracted_data->email->>messageId=eq."+encodeURIComponent(messageId)+"&select=id,customer,status,docs&limit=1").catch(()=>[])
      : [];
    const existing=existingByTicket[0]||existingByMessage[0];
    if(existing){
      if(!repair)return res.status(200).json({ok:true,duplicate:true,packId:existing.id,customer:existing.customer,status:existing.status,message:"Email already ingested."});
      id=existing.id;
    }
    let emailExtraction={fields:[],warnings:[]};
    if(emailFields.length){
      try{
        emailExtraction=await extractConfiguredEmailFields({subject,text,html,emailFields});
      }catch(error){
        emailExtraction={fields:[],warnings:["Configured email-field extraction failed: "+formatExtractionError(error)]};
      }
    }

    const pack={
      organisationId:DEFAULT_ORGANISATION.id,
      organisationName:DEFAULT_ORGANISATION.name,
      id,
      customer,
      docs:attachments.length,
      status:"Processing",
      confidence:0,
      received:receivedAt,
      ticket,
      assignedTo:"Unassigned",
      uploadedFiles:attachments.map((a,index)=>({
        id:id+"-"+index,
        name:String(a.filename||a.name||("attachment-"+(index+1))),
        size:Number(a.size)||0,
        type:String(a.mimeType||a.contentType||"application/octet-stream"),
        storagePath:null
      })),
      email:{
        messageId,
        from,
        to,
        subject,
        text,
        html,
        receivedAt,
        extraction:emailExtraction,
        configuredFields:emailFields
      }
    };

    // Persist the pack immediately so the inbox can observe the webhook intake
    // while attachment storage/extraction is still running.
    await supabaseFetch("document_packs?id=eq."+encodeURIComponent(pack.id),{
      method:"PATCH",
      body:JSON.stringify({
        id:pack.id,
        organisation_id:DEFAULT_ORGANISATION.id,
        customer:pack.customer,
        docs:pack.docs,
        status:"Processing",
        confidence:0,
        received:pack.received,
        ticket:pack.ticket,
        assigned_to:pack.assignedTo,
        extracted_data:{
          _tenant:{organisationId:DEFAULT_ORGANISATION.id,organisationName:DEFAULT_ORGANISATION.name},
          documentType:"email",
          email:pack.email,
          documents:[],
          documentCount:0,
          sourceDocuments:[],
          emailFields:emailExtraction.fields,
          warnings:emailExtraction.warnings||[],
          agentMessages:[],
          _manager:{processingStartedAt:new Date().toISOString(),processingCompletedAt:null,uploadedFiles:pack.uploadedFiles}
        },
        processing_error:emailExtraction.warnings?.length?emailExtraction.warnings.join(" | "):null,
        updated_at:new Date().toISOString()
      }),
      headers:{"Prefer":"resolution=merge-duplicates,return=minimal"}
    });

    const attachmentResults=[];
    const storedFiles=[];
    for(const attachment of attachments){
      const filename=String(attachment.filename||attachment.name||"attachment");
      const mimeType=String(attachment.mimeType||attachment.contentType||"application/octet-stream");
      const fileData=normaliseAttachmentData(attachment);
      if(!fileData){attachmentResults.push({filename,mimeType,error:"Attachment content was not supplied by the email connector."});continue;}
      try{
        // Persist the original source document independently of extraction.
        // A failed extraction must never make the source document unavailable
        // for review or a later re-process.
        let storagePath=null;
        let storageError=null;
        try{
          storagePath=await storeAttachment({packId:id,filename,mimeType,fileData});
          storedFiles.push({id:id+"-"+storedFiles.length,name:filename,size:Number(attachment.size)||0,type:mimeType,storagePath});
        }catch(error){
          storageError=formatExtractionError(error);
          storedFiles.push({id:id+"-"+storedFiles.length,name:filename,size:Number(attachment.size)||0,type:mimeType,storagePath:null,storageError});
        }

        const extraction=await extractAttachment({fileData,filename,mimeType});
        attachmentResults.push({filename,mimeType,extraction:extraction.extraction,source:extraction.source,storagePath,storageError});
      }catch(error){
        attachmentResults.push({filename,mimeType,error:formatExtractionError(error)});
      }
    }
    const successfulExtractions=attachmentResults.filter(item=>item.extraction).map(item=>item.extraction);
    const primaryExtraction=successfulExtractions.find(item=>item.documentType==="commercial_invoice")||successfulExtractions[0]||null;
    const extractionWarnings=[...(emailExtraction.warnings||[]),...attachmentResults.filter(item=>item.error).map(item=>item.filename+": "+formatExtractionError(item.error))];
    const extractedData={...(primaryExtraction||{}),_tenant:{organisationId:DEFAULT_ORGANISATION.id,organisationName:DEFAULT_ORGANISATION.name},documentType:primaryExtraction?.documentType||"email",email:pack.email,documents:attachmentResults,documentCount:attachmentResults.length,sourceDocuments:attachmentResults.map(item=>({name:item.filename,type:item.extraction?.documentType||item.mimeType,extraction:item.extraction||null,error:item.error||null})),emailFields:emailExtraction.fields,warnings:extractionWarnings,agentMessages:[]};
    const processingStatus="Needs review";

    extractedData._manager={processingStartedAt:receivedAt,processingCompletedAt:new Date().toISOString(),uploadedFiles:storedFiles.length?storedFiles:pack.uploadedFiles};
    await supabaseFetch("document_packs",{
      method:"POST",
      body:JSON.stringify({
        id:pack.id,
        organisation_id:DEFAULT_ORGANISATION.id,
        customer:pack.customer,
        docs:pack.docs,
        status:processingStatus,
        confidence:successfulExtractions.length?Math.round(successfulExtractions.reduce((sum,item)=>sum+Number(item.confidence||0),0)/successfulExtractions.length):0,
        received:pack.received,
        ticket:pack.ticket,
        assigned_to:pack.assignedTo,
        extracted_data:extractedData,
        processing_error:extractionWarnings.length?extractionWarnings.join(" | "):null,
        updated_at:new Date().toISOString()
      }),
      headers:{"Prefer":"resolution=merge-duplicates,return=minimal"}
    });

    return res.status(200).json({
      ok:true,
      packId:id,
      customer,
      status:processingStatus,
      attachmentCount:attachmentResults.length,
      extractedAttachmentCount:successfulExtractions.length,
      emailExtraction,
      message:"Email accepted into the Customs IDP ingestion pipeline."
    });
  }catch(error){
    return res.status(500).json({error:error.message||"Email ingestion failed."});
  }
}

async function storeAttachment({packId,filename,mimeType,fileData}){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Supabase storage configuration is missing.");
  const supabase=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const raw=String(fileData||"");
  const base64=raw.includes(",")?raw.slice(raw.indexOf(",")+1):raw;
  const buffer=Buffer.from(base64,"base64");
  const safePack=String(packId).replace(/[^a-zA-Z0-9._-]+/g,"-");
  const safeName=String(filename).replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"document";
  const path=safePack+"/"+Date.now()+"-"+safeName;
  const {error}=await supabase.storage.from("CUSTOMS-DOCUMENTS").upload(path,buffer,{contentType:mimeType,upsert:false});
  if(error)throw new Error(error.message);
  return path;
}
async function extractConfiguredEmailFields({subject,text,html,emailFields}){
  if(!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured in Vercel.");

  const source=[subject?("SUBJECT:\n"+subject):"",text?("BODY:\n"+text):html?("HTML BODY:\n"+html):""].filter(Boolean).join("\n\n");
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer "+process.env.OPENAI_API_KEY
    },
    body:JSON.stringify({
      model:"gpt-5.6-luna",
      input:[{
        role:"user",
        content:[{
          type:"input_text",
          text:"You are the email source extraction component for a UK customs IDP platform. Extract ONLY the explicitly configured fields listed below from the supplied email subject/body. Do not answer unrelated questions. Do not infer, guess, transform or apply customer rules. If a configured field is not explicitly supported by the email, return null. Preserve evidence showing whether the value came from the subject or body. Configured fields: "+JSON.stringify(emailFields)+"\n\nEmail source:\n"+source
        }]
      }],
      text:{
        format:{
          type:"json_schema",
          name:"customs_email_field_extraction_v1",
          strict:true,
          schema:{
            type:"object",
            additionalProperties:false,
            properties:{
              fields:{
                type:"array",
                items:{
                  type:"object",
                  additionalProperties:false,
                  properties:{
                    field:{type:"string"},
                    value:{type:["string","number","null"]},
                    sourceType:{type:"string",enum:["email_subject","email_body","null"]},
                    sourceText:{type:["string","null"]},
                    confidence:{type:"number"}
                  },
                  required:["field","value","sourceType","sourceText","confidence"]
                }
              },
              warnings:{type:"array",items:{type:"string"}}
            },
            required:["fields","warnings"]
          }
        }
      }
    })
  });

  const data=await response.json();
  if(!response.ok) throw new Error(data?.error?.message||"Email field extraction failed.");
  const output=data.output_text||data.output?.flatMap(item=>item.content||[]).find(item=>item.type==="output_text")?.text;
  if(!output) throw new Error("No structured email extraction was returned.");
  return JSON.parse(output);
}

function normaliseAttachmentData(attachment){
  const raw=attachment.dataUrl||attachment.fileData||attachment.contentBase64||attachment.base64||attachment.content;
  if(!raw)return null;
  const value=String(raw);
  if(value.startsWith("data:"))return value;
  if(attachment.encoding==="base64"||attachment.contentBase64||attachment.base64||attachment.fileData)return "data:"+String(attachment.mimeType||attachment.contentType||"application/octet-stream")+";base64,"+value;
  return value.startsWith("http")?value:null;
}

async function extractAttachment({fileData,filename,mimeType}){
  // Email ingestion uses the same extraction engine as browser uploads,
  // but invokes it directly so Outlook intake does not depend on a second
  // Vercel HTTP hop or authentication layer.
  return await extractDocument({fileData,filename,mimeType});
}
function formatExtractionError(error){if(error==null)return "Unknown extraction error.";if(typeof error==="string")return error;if(error instanceof Error&&error.message)return error.message;if(typeof error==="object"){if(typeof error.message==="string")return error.message;if(error.error?.message)return String(error.error.message);try{return JSON.stringify(error);}catch{return String(error);}}try{return String(error);}catch{return "Unknown extraction error.";}}
function readJson(value,fallback){
  if(!value)return fallback;
  try{return JSON.parse(value);}catch{return fallback;}
}

function safeEqual(a,b){
  const aa=Buffer.from(String(a));
  const bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}

async function supabaseFetch(path,options={}){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured in Vercel.");
  const response=await fetch(url+"/rest/v1/"+path,{
    ...options,
    headers:{
      apikey:key,
      Authorization:"Bearer "+key,
      "Content-Type":"application/json",
      ...(options.headers||{})
    }
  });
  if(!response.ok) throw new Error(await response.text());
  const responseText=await response.text();
  return responseText?JSON.parse(responseText):[];
}
