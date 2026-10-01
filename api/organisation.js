import { requireAuth } from "./authGuard.js";

export default async function handler(req,res){
  const auth=requireAuth(req,res);
  if(!auth)return;

  if(req.method!=="GET"){
    return res.status(405).json({error:"Method not allowed"});
  }

  const action=String(req.query?.action||"summary").toLowerCase();
  if(!["summary","customers","teams"].includes(action)){
    return res.status(400).json({error:"Unknown organisation action"});
  }

  try{
    const organisationId=auth.organisationId;
    const organisationRows=await supabaseFetch(
      `organisations?id=eq.${encodeURIComponent(organisationId)}&select=id,name,status&limit=1`
    );
    const organisation=organisationRows?.[0];
    if(!organisation||organisation.status!=="active"){
      return res.status(403).json({error:"Organisation is not configured."});
    }

    const [teams,customers,strategies,mailboxes,packs]=await Promise.all([
      supabaseFetch(`teams?organisation_id=eq.${encodeURIComponent(organisationId)}&select=id,name,status&order=name.asc`),
      supabaseFetch(`customers?organisation_id=eq.${encodeURIComponent(organisationId)}&select=id,name,code,status,team_id&order=name.asc`),
      supabaseFetch(`customer_strategies?organisation_id=eq.${encodeURIComponent(organisationId)}&status=eq.active&select=id,customer_id,version,status,config,updated_at&order=version.desc`),
      supabaseFetch(`mailboxes?organisation_id=eq.${encodeURIComponent(organisationId)}&select=id,address,status,provider,customer_id,team_id&order=address.asc`),
      supabaseFetch(`document_packs?organisation_id=eq.${encodeURIComponent(organisationId)}&select=id,customer`)
    ]);

    const strategyByCustomerId={};
    for(const strategy of strategies){
      if(!strategyByCustomerId[strategy.customer_id]) strategyByCustomerId[strategy.customer_id]=strategy;
    }

    const mailboxByCustomerId={};
    for(const mailbox of mailboxes){
      if(mailbox.customer_id&&!mailboxByCustomerId[mailbox.customer_id]) mailboxByCustomerId[mailbox.customer_id]=mailbox;
    }

    const processedByCustomer={};
    for(const pack of packs){
      const name=String(pack.customer||"").trim();
      if(name) processedByCustomer[name]=(processedByCustomer[name]||0)+1;
    }

    const resultCustomers=customers.map(customer=>{
      const strategy=strategyByCustomerId[customer.id];
      const mailbox=mailboxByCustomerId[customer.id]||null;
      return {
        id:customer.id,
        name:customer.name,
        code:customer.code,
        status:customer.status,
        teamId:customer.team_id||null,
        teamName:teams.find(team=>team.id===customer.team_id)?.name||null,
        mailbox:mailbox?.address||null,
        mailboxStatus:mailbox?.status||null,
        mailboxProvider:mailbox?.provider||null,
        strategyId:strategy?.id||null,
        strategyVersion:strategy?.version||null,
        strategyStatus:strategy?.status||null,
        strategy:strategy?.config||{},
        rules:countStrategyRules(strategy?.config),
        processed:processedByCustomer[customer.name]||0
      };
    });

    return res.status(200).json({
      organisation:{
        id:organisation.id,
        name:organisation.name,
        status:organisation.status
      },
      teams,
      customers:resultCustomers,
      strategies,
      mailboxes
    });
  }catch(error){
    return res.status(503).json({error:error.message||"Unable to load organisation data."});
  }
}

function countStrategyRules(config){
  if(!config||typeof config!=="object")return 0;
  const ruleKeys=["emailFields","validationRules","extractionRules","requiredFields","fieldRules","customValidations"];
  return ruleKeys.reduce((count,key)=>{
    const value=config[key];
    if(Array.isArray(value))return count+value.length;
    if(value&&typeof value==="object")return count+Object.keys(value).length;
    return count;
  },0);
}

async function supabaseFetch(path,options={}){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured in Vercel.");

  const response=await fetch(`${url}/rest/v1/${path}`,{
    ...options,
    headers:{
      apikey:key,
      Authorization:`Bearer ${key}`,
      "Content-Type":"application/json",
      ...(options.headers||{})
    }
  });

  if(!response.ok)throw new Error(await response.text());
  const text=await response.text();
  return text?JSON.parse(text):[];
}
