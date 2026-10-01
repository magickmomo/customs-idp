import crypto from "node:crypto";
const COOKIE_NAME="customs-idp-auth";
const MAX_AGE_SECONDS=60*60*24*7;
const DEFAULT_ORGANISATION_ID="demo-organisation";

function getPassword(){return String(process.env.IDP_ACCESS_PASSWORD||"");}
function getSecret(){const configured=String(process.env.IDP_AUTH_SECRET||"");return configured||crypto.createHash("sha256").update(getPassword()).digest("hex");}
function sign(value){return crypto.createHmac("sha256",getSecret()).update(value).digest("base64url");}
function parseCookies(header=""){return Object.fromEntries(String(header).split(";").map(part=>part.trim()).filter(Boolean).map(part=>{const i=part.indexOf("=");return i<0?[part,""]:[part.slice(0,i),decodeURIComponent(part.slice(i+1))];}));}

export function createAuthCookie(organisationId=DEFAULT_ORGANISATION_ID){
  const payload=JSON.stringify({iat:Date.now(),organisationId:String(organisationId||DEFAULT_ORGANISATION_ID)});
  const encoded=Buffer.from(payload).toString("base64url");
  const token=encoded+"."+sign(encoded);
  return COOKIE_NAME+"="+encodeURIComponent(token)+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age="+MAX_AGE_SECONDS;
}

export function clearAuthCookie(){return COOKIE_NAME+"=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";}

export function getAuthContext(req){
  const password=getPassword();
  if(!password)return null;
  const token=parseCookies(req.headers?.cookie||"")[COOKIE_NAME];
  if(!token)return null;
  const [encoded,signature]=String(token).split(".");
  if(!encoded||!signature)return null;

  let payload;
  try{
    payload=JSON.parse(Buffer.from(encoded,"base64url").toString("utf8"));
  }catch{return null;}

  const issuedAt=Number(payload?.iat);
  if(!Number.isFinite(issuedAt)||Date.now()-issuedAt>MAX_AGE_SECONDS*1000)return null;

  const expected=sign(encoded);
  if(signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;

  return {
    authenticated:true,
    organisationId:String(payload.organisationId||DEFAULT_ORGANISATION_ID)
  };
}

export function isAuthenticated(req){return Boolean(getAuthContext(req));}

export function requireAuth(req,res){
  const context=getAuthContext(req);
  if(context)return context;

  const ingestSecret=String(process.env.EMAIL_INGEST_SECRET||"");
  const supplied=String(req.headers?.["x-email-ingest-secret"]||"");
  if(ingestSecret&&supplied&&supplied.length===ingestSecret.length&&crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(ingestSecret))){
    return {
      authenticated:true,
      organisationId:DEFAULT_ORGANISATION_ID,
      source:"email-ingest"
    };
  }

  res.status(401).json({error:"Authentication required"});
  return null;
}