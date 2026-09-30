import { requireAuth } from "../authGuard.js";
export default async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  if(!requireAuth(req,res))return;
  try{
    const rows=await supabaseFetch("outlook_connections?select=email,display_name,status,updated_at&status=eq.connected&order=updated_at.desc&limit=1");
    const row=rows[0]||null;
    return res.status(200).json({connected:Boolean(row),connection:row});
  }catch(error){return res.status(503).json({error:error.message});}
}
async function supabaseFetch(path,options={}){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Supabase configuration is missing.");
  const r=await fetch(url+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...(options.headers||{})}});
  if(!r.ok)throw new Error(await r.text());
  const t=await r.text();return t?JSON.parse(t):[];
}
