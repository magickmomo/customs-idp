import { requireAuth } from "./authGuard.js";
import { normalizePack, packToRow, supabaseFetch } from "../services/packRepository.js";

export default async function handler(req,res){
  const auth=requireAuth(req,res);
  if(!auth)return;

  const organisationId=auth.organisationId;

  if(req.method==="GET"){
    try{
      const rows=await supabaseFetch(
        `document_packs?organisation_id=eq.${encodeURIComponent(organisationId)}&select=*&order=created_at.desc`
      );
      return res.status(200).json({packs:rows.map(normalizePack)});
    }catch(error){return res.status(503).json({error:error.message});}
  }

  if(req.method==="POST"){
    try{
      const pack=req.body||{};
      if(!pack.id) return res.status(400).json({error:"Pack id is required"});

      const requestedOrganisationId=String(pack.organisationId||organisationId).trim()||organisationId;
      if(requestedOrganisationId!==organisationId){
        return res.status(403).json({error:"Pack organisation does not match the active organisation."});
      }

      const organisation=await getOrganisation(organisationId);
      if(!organisation){
        return res.status(403).json({error:"Organisation is not configured."});
      }

      const row=packToRow({...pack,organisationId:organisation.id,organisationName:organisation.name});

      await supabaseFetch("document_packs",{
        method:"POST",
        body:JSON.stringify(row),
        headers:{
          "Prefer":"resolution=merge-duplicates,return=minimal"
        }
      });

      return res.status(200).json({pack:normalizePack(row)});
    }catch(error){return res.status(503).json({error:error.message});}
  }

  if(req.method==="DELETE"){
    try{
      const role=String(auth.role||"").toLowerCase();
      if(!["manager","admin"].includes(role)) return res.status(403).json({error:"Only managers can delete packs"});

      const id=String(req.query?.id||"").trim();
      if(!id) return res.status(400).json({error:"Pack id is required"});

      await supabaseFetch(
        `document_packs?id=eq.${encodeURIComponent(id)}&organisation_id=eq.${encodeURIComponent(organisationId)}`,
        {method:"DELETE",headers:{"Prefer":"return=minimal"}}
      );

      return res.status(200).json({deleted:id,organisationId});
    }catch(error){return res.status(503).json({error:error.message});}
  }

  return res.status(405).json({error:"Method not allowed"});
}

async function getOrganisation(id){
  const rows=await supabaseFetch(
    `organisations?id=eq.${encodeURIComponent(id)}&select=id,name,status&limit=1`
  );
  const organisation=rows?.[0];
  if(!organisation||organisation.status!=="active")return null;
  return organisation;
}
