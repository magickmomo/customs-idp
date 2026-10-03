import crypto from "node:crypto";

const TOKEN_URL="https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const GRAPH="https://graph.microsoft.com/v1.0";

export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).send("Method not allowed");
  try{
    const error=String(req.query?.error||"");
    if(error) return res.status(400).send("Outlook authorisation was cancelled or failed: "+(req.query?.error_description||error));
    const code=String(req.query?.code||"");
    const state=String(req.query?.state||"");
    if(!code||!state) return res.status(400).send("Missing Outlook authorisation code or state.");
    verifyState(state);
    const clientId=String(process.env.OUTLOOK_CLIENT_ID||"").trim();
    const clientSecret=String(process.env.OUTLOOK_CLIENT_SECRET||"").trim();
    if(!clientId||!clientSecret) throw new Error("Outlook OAuth client credentials are not configured.");
    const redirectUri=getRedirectUri(req);
    const tokenResponse=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({
      client_id:clientId,
      client_secret:clientSecret,
      code,
      redirect_uri:redirectUri,
      grant_type:"authorization_code",
      scope:"openid profile offline_access User.Read Mail.Read"
    })});
    const tokenData=await tokenResponse.json();
    if(!tokenResponse.ok) throw new Error(tokenData?.error_description||"Microsoft token exchange failed.");
    const accessToken=String(tokenData.access_token||"");
    const refreshToken=String(tokenData.refresh_token||"");
    if(!accessToken||!refreshToken) throw new Error("Microsoft did not return the tokens required for mailbox access.");
    const me=await graphGet("/me",{Authorization:"Bearer "+accessToken});
    const email=String(me.mail||me.userPrincipalName||"").trim().toLowerCase();
    if(!email) throw new Error("Microsoft did not return the Outlook account address.");
    const encryptedRefreshToken=encrypt(refreshToken);
    const connectionId="outlook-"+crypto.randomUUID();
    const clientState=crypto.randomBytes(24).toString("hex");
    await supabaseFetch("outlook_connections",{method:"POST",body:JSON.stringify({
      id:connectionId,
      email,
      display_name:me.displayName||null,
      refresh_token:encryptedRefreshToken,
      scopes:"openid profile offline_access User.Read Mail.Read",
      status:"connected",
      updated_at:new Date().toISOString()
    }),headers:{"Prefer":"resolution=merge-duplicates,return=minimal"}});
    const subscription=await graphPost("/subscriptions",accessToken,{
      changeType:"created",
      notificationUrl:getWebhookUrl(),
      resource:"me/mailFolders('Inbox')/messages",
      expirationDateTime:new Date(Date.now()+2*24*60*60*1000).toISOString(),
      clientState
    });
    await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(connectionId),{method:"PATCH",body:JSON.stringify({
      subscription_id:subscription.id,
      subscription_expires_at:subscription.expirationDateTime,
      client_state:clientState,
      updated_at:new Date().toISOString()
    })});
    const html="<!doctype html><html><body style=\"font-family:Arial,sans-serif;padding:40px\"><h2>Outlook connected</h2><p><b>"+escapeHtml(email)+"</b> is now connected to Customs IDP.</p><p>You can close this window and return to Customs IDP.</p></body></html>";
    return res.status(200).setHeader("Content-Type","text/html").send(html);
  }catch(error){
    return res.status(500).send("Outlook connection failed: "+escapeHtml(error.message||"Unknown error"));
  }
}
function verifyState(value){
  const [raw,sig]=String(value).split(".");
  const secret=String(process.env.IDP_AUTH_SECRET||process.env.EMAIL_INGEST_SECRET||"");
  if(!raw||!sig||!secret) throw new Error("Invalid OAuth state.");
  const expected=crypto.createHmac("sha256",secret).update(raw).digest("base64url");
  if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) throw new Error("Invalid OAuth state signature.");
  const payload=JSON.parse(Buffer.from(raw,"base64url").toString("utf8"));
  if(!payload.createdAt||Date.now()-Number(payload.createdAt)>10*60*1000) throw new Error("OAuth state has expired.");
}
function getRedirectUri(req){return String(process.env.OUTLOOK_REDIRECT_URI||"").trim()||("https://"+String(process.env.VERCEL_URL||"customs-idp.vercel.app").trim()+"/api/outlook/callback");}
function encrypt(value){
  const key=Buffer.from(String(process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY||""),"base64");
  if(key.length!==32) throw new Error("OUTLOOK_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [iv.toString("base64url"),tag.toString("base64url"),encrypted.toString("base64url")].join(".");
}
async function graphGet(path,headers){const r=await fetch(GRAPH+path,{headers});const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||"Microsoft Graph request failed.");return d;}
async function graphPost(path,token,body){const r=await fetch(GRAPH+path,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||"Graph subscription failed.");return d;}
function getWebhookUrl(){return "https://customs-idp.vercel.app/api/outlook/webhook";}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function supabaseFetch(path,options={}){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured.");
  const r=await fetch(url+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...(options.headers||{})}});
  if(!r.ok) throw new Error(await r.text());
  const t=await r.text();return t?JSON.parse(t):[];
}
