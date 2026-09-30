import crypto from "node:crypto";

const GRAPH="https://graph.microsoft.com/v1.0";
const TOKEN_URL="https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

export default async function handler(req,res){
  if(req.method!=="GET"&&req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const cronSecret=String(process.env.CRON_SECRET||"").trim();
  const supplied=String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim();
  if(cronSecret && supplied!==cronSecret)return res.status(401).json({error:"Unauthorized"});
  try{
    const rows=await supabaseFetch("outlook_connections?select=*&status=eq.connected&limit=1");
    const connection=rows[0];
    if(!connection)return res.status(200).json({ok:true,message:"No Outlook connection configured."});
    const accessToken=await refreshToken(connection);
    const clientState=connection.client_state||crypto.randomBytes(24).toString("hex");
    const expiration=new Date(Date.now()+2*24*60*60*1000).toISOString();
    if(connection.subscription_id){
      await graphDelete("/subscriptions/"+encodeURIComponent(connection.subscription_id),accessToken).catch(()=>{});
    }
    const subscription=await graphPost("/subscriptions",accessToken,{
      changeType:"created",
      notificationUrl:getWebhookUrl(),
      resource:"me/mailFolders('Inbox')/messages",
      expirationDateTime:expiration,
      clientState
    });
    await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(connection.id),{method:"PATCH",body:JSON.stringify({subscription_id:subscription.id,subscription_expires_at:subscription.expirationDateTime,client_state:clientState,updated_at:new Date().toISOString()})});
    return res.status(200).json({ok:true,subscriptionId:subscription.id,expiresAt:subscription.expirationDateTime});
  }catch(error){return res.status(500).json({ok:false,error:error.message||"Unable to renew Outlook subscription."});}
}

async function refreshToken(connection){
  const refresh=decrypt(connection.refresh_token);
  const r=await fetch(TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:String(process.env.OUTLOOK_CLIENT_ID||""),client_secret:String(process.env.OUTLOOK_CLIENT_SECRET||""),refresh_token:refresh,grant_type:"refresh_token",scope:"openid profile offline_access User.Read Mail.Read"})});
  const d=await r.json();if(!r.ok)throw new Error(d?.error_description||"Unable to refresh Outlook token.");
  if(d.refresh_token)await supabaseFetch("outlook_connections?id=eq."+encodeURIComponent(connection.id),{method:"PATCH",body:JSON.stringify({refresh_token:encrypt(d.refresh_token),updated_at:new Date().toISOString()})});
  return d.access_token;
}
async function graphPost(path,token,body){const r=await fetch(GRAPH+path,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||"Graph subscription failed.");return d;}
async function graphDelete(path,token){const r=await fetch(GRAPH+path,{method:"DELETE",headers:{Authorization:"Bearer "+token}});if(!r.ok)throw new Error(await r.text());}
function getWebhookUrl(){return "https://"+String(process.env.VERCEL_URL||"customs-idp.vercel.app").trim()+"/api/outlook/webhook";}
function decrypt(value){const key=Buffer.from(String(process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY||""),"base64");const [ivRaw,tagRaw,dataRaw]=String(value||"").split(".");const decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(ivRaw,"base64url"));decipher.setAuthTag(Buffer.from(tagRaw,"base64url"));return Buffer.concat([decipher.update(Buffer.from(dataRaw,"base64url")),decipher.final()]).toString("utf8");}
function encrypt(value){const key=Buffer.from(String(process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY||""),"base64");const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");}
async function supabaseFetch(path,options={}){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("Supabase configuration is missing.");const r=await fetch(url+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",...(options.headers||{})}});if(!r.ok)throw new Error(await r.text());const t=await r.text();return t?JSON.parse(t):[];}
