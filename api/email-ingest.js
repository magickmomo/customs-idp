import crypto from "crypto";

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
    const receivedAt=body.receivedAt||body.received_at||new Date().toISOString();
    const attachments=Array.isArray(body.attachments)?body.attachments:[];

    if(!to) return res.status(400).json({error:"to is required."});

    const routing=readJson(process.env.CUSTOMER_EMAIL_ROUTING_JSON,{});
    const customer=routing[to]?.customer || String(body.customer||"").trim() || "Unassigned customer";
    const strategy=readJson(process.env.CUSTOMER_EMAIL_STRATEGIES_JSON,{});
    const configured=strategy[customer] || DEFAULT_STRATEGIES[customer] || {emailFields:[]};
    const emailFields=Array.isArray(configured.emailFields)?configured.emailFields.filter(Boolean):[];

    const emailExtraction=emailFields.length
      ? await extractConfiguredEmailFields({subject,text,html,emailFields})
      : {fields:[],warnings:["Email field extraction is not configured for this customer. Subject and body are retained as source context only."]};

    const highest=Number(body.packNumber)||0;
    const id="PK-EMAIL-"+Date.now().toString(36).toUpperCase();
    const pack={
      id,
      customer,
      docs:attachments.length,
      status:"Processing",
      confidence:0,
      received:receivedAt,
      ticket:messageId||("EMAIL-"+Date.now().toString().slice(-6)),
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

    const extractedData={
      documentType:"email",
      email:pack.email,
      documents:[],
      documentCount:0,
      sourceDocuments:[],
      emailFields:emailExtraction.fields,
      warnings:emailExtraction.warnings||[],
      agentMessages:[]
    };

    await supabaseFetch("document_packs",{
      method:"POST",
      body:JSON.stringify({
        id:pack.id,
        customer:pack.customer,
        docs:pack.docs,
        status:pack.status,
        confidence:pack.confidence,
        received:pack.received,
        ticket:pack.ticket,
        assigned_to:pack.assignedTo,
        extracted_data:extractedData,
        processing_error:null,
        updated_at:new Date().toISOString()
      }),
      headers:{"Prefer":"resolution=merge-duplicates,return=minimal"}
    });

    return res.status(200).json({
      ok:true,
      packId:id,
      customer,
      status:"Processing",
      emailExtraction,
      message:"Email accepted into the Customs IDP ingestion pipeline."
    });
  }catch(error){
    return res.status(500).json({error:error.message||"Email ingestion failed."});
  }
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
