import crypto from "node:crypto";
const COOKIE_NAME="customs-idp-auth";
const MAX_AGE_SECONDS=60*60*24*7;
function getPassword(){return String(process.env.IDP_ACCESS_PASSWORD||"");}
function getSecret(){const configured=String(process.env.IDP_AUTH_SECRET||"");return configured||crypto.createHash("sha256").update(getPassword()).digest("hex");}
function sign(value){return crypto.createHmac("sha256",getSecret()).update(value).digest("base64url");}
function parseCookies(header=""){return Object.fromEntries(String(header).split(";").map(part=>part.trim()).filter(Boolean).map(part=>{const i=part.indexOf("=");return i<0?[part,""]:[part.slice(0,i),decodeURIComponent(part.slice(i+1))];}));}
export function createAuthCookie(){const payload=String(Date.now());const token=payload+"."+sign(payload);return COOKIE_NAME+"="+encodeURIComponent(token)+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age="+MAX_AGE_SECONDS;}
export function clearAuthCookie(){return COOKIE_NAME+"=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";}
export function isAuthenticated(req){const password=getPassword();if(!password)return false;const token=parseCookies(req.headers?.cookie||"")[COOKIE_NAME];if(!token)return false;const [payload,signature]=String(token).split(".");if(!payload||!signature||!Number.isFinite(Number(payload))||Date.now()-Number(payload)>MAX_AGE_SECONDS*1000)return false;const expected=sign(payload);return signature.length===expected.length&&crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected));}
export function requireAuth(req,res){if(isAuthenticated(req))return true;const ingestSecret=String(process.env.EMAIL_INGEST_SECRET||"");const supplied=String(req.headers?.["x-email-ingest-secret"]||"");if(ingestSecret&&supplied&&supplied.length===ingestSecret.length&&crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(ingestSecret)))return true;res.status(401).json({error:"Authentication required"});return false;}