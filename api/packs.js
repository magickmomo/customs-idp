export default async function handler(req,res){
  if(req.method==="GET"){
    try{
      const rows=await supabaseFetch("document_packs?select=*&order=created_at.desc");
      return res.status(200).json({packs:rows.map(normalizePack)});
    }catch(error){return res.status(503).json({error:error.message});}
  }
  if(req.method==="POST"){
    try{
      const pack=req.body||{};
      if(!pack.id) return res.status(400).json({error:"Pack id is required"});
      const row={id:pack.id,customer:pack.customer||"Unassigned customer",docs:Number(pack.docs)||0,status:pack.status||"Processing",confidence:Number(pack.confidence)||0,received:pack.received||new Date().toISOString(),ticket:pack.ticket||null,assigned_to:pack.assignedTo||"Unassigned",extracted_data:pack.extractedData||null,processing_error:pack.processingError||null,updated_at:new Date().toISOString()};
      await supabaseFetch("document_packs",{method:"POST",body:JSON.stringify(row),headers:{"Prefer":"resolution=merge-duplicates,return=minimal"}});
      return res.status(200).json({pack:normalizePack(row)});
    }catch(error){return res.status(503).json({error:error.message});}
  }
  return res.status(405).json({error:"Method not allowed"});
}
async function supabaseFetch(path,options={}){
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured in Vercel.");
  const response=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{"apikey":key,"Authorization":`Bearer ${key}`,"Content-Type":"application/json",...(options.headers||{})}});
  if(!response.ok) throw new Error(await response.text());
  const text=await response.text(); return text?JSON.parse(text):[];
}
function normalizePack(row){return {...row,assignedTo:row.assigned_to||"Unassigned",extractedData:row.extracted_data||undefined,processingError:row.processing_error||undefined};}
