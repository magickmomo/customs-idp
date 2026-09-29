import { clearAuthCookie, createAuthCookie, isAuthenticated } from "./authGuard.js";
export default async function handler(req,res){
  if(req.method==="GET")return res.status(200).json({authenticated:isAuthenticated(req)});
  if(req.method==="POST"){
    const password=String(req.body?.password||"");
    const expected=String(process.env.IDP_ACCESS_PASSWORD||"");
    if(!expected)return res.status(500).json({error:"IDP_ACCESS_PASSWORD is not configured in Vercel."});
    if(password!==expected)return res.status(401).json({error:"Incorrect password"});
    res.setHeader("Set-Cookie",createAuthCookie());
    return res.status(200).json({authenticated:true});
  }
  if(req.method==="DELETE"){res.setHeader("Set-Cookie",clearAuthCookie());return res.status(200).json({authenticated:false});}
  return res.status(405).json({error:"Method not allowed"});
}