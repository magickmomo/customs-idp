import crypto from "node:crypto";
import { requireAuth } from "../authGuard.js";

const AUTHORITY="https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";

export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  if(!requireAuth(req,res)) return;
  const clientId=String(process.env.OUTLOOK_CLIENT_ID||"").trim();
  if(!clientId) return res.status(500).json({error:"OUTLOOK_CLIENT_ID is not configured."});
  const redirectUri=getRedirectUri(req);
  const state=signState({nonce:crypto.randomBytes(24).toString("hex"),createdAt:Date.now()});
  const params=new URLSearchParams({
    client_id:clientId,
    response_type:"code",
    redirect_uri:redirectUri,
    response_mode:"query",
    scope:"openid profile offline_access User.Read Mail.Read",
    state
  });
  return res.status(200).json({authorizationUrl:AUTHORITY+"?"+params.toString()});
}

function getRedirectUri(req){
  return String(process.env.OUTLOOK_REDIRECT_URI||"").trim() ||
    ("https://"+String(process.env.VERCEL_URL||"customs-idp.vercel.app").trim()+"/api/outlook/callback");
}
function signState(payload){
  const raw=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret=String(process.env.IDP_AUTH_SECRET||process.env.EMAIL_INGEST_SECRET||"");
  if(!secret) throw new Error("IDP_AUTH_SECRET or EMAIL_INGEST_SECRET is required for Outlook OAuth state.");
  const sig=crypto.createHmac("sha256",secret).update(raw).digest("base64url");
  return raw+"."+sig;
}
