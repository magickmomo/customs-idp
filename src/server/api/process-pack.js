import { requireAuth } from "./authGuard.js";
import { ProcessPackError, processPack } from "../services/processPack.js";

export function createProcessPackHandler(processor=processPack){
  return async function handler(req,res){
    const auth=requireAuth(req,res);
    if(!auth)return;
    if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
    const packId=String(req.body?.packId||"").trim();
    const reason=String(req.body?.reason||"").trim();
    if(!packId)return res.status(400).json({error:"Pack id is required."});
    if(!["initial","reprocess"].includes(reason))return res.status(400).json({error:"Reason must be initial or reprocess."});
    try{
      const pack=await processor({
        organisationId:auth.organisationId,
        packId,
        reason,
        actor:{userId:auth.userId||null,name:auth.name||auth.email||"Customs IDP System",type:auth.source==="email-ingest"?"system":"user"}
      });
      return res.status(200).json({pack});
    }catch(error){
      const status=error instanceof ProcessPackError?error.status:500;
      return res.status(status).json({error:error?.message||"Pack processing failed.",packId,pack:error?.pack||undefined});
    }
  }
}

export default createProcessPackHandler();
