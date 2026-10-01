import { requireAuth } from "./authGuard.js";
import { extractDocument } from "./document-extraction.js";
export default async function handler(req,res){
  if(!requireAuth(req,res))return;
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  try{
    const {fileData,filename,mimeType}=req.body||{};
    if(!fileData||!filename)return res.status(400).json({error:"fileData and filename are required."});
    return res.status(200).json(await extractDocument({fileData,filename,mimeType}));
  }catch(error){return res.status(500).json({error:error?.message||"Extraction failed."});}
}
