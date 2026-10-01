import { clearAuthCookie, createAuthCookie, getAuthContext } from "./authGuard.js";
export default async function handler(req,res){
  if(req.method==="GET"){const context=getAuthContext(req);if(!context)return res.status(200).json({authenticated:false});return res.status(200).json({authenticated:true,user:{id:context.userId,email:context.email,name:context.name,role:context.role},organisation:{id:context.organisationId}});}
  if(req.method==="POST"){
    const token=String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim();
    if(!token)return res.status(401).json({error:"Supabase access token is required."});
    const user=await getSupabaseUser(token);
    if(!user)return res.status(401).json({error:"Supabase session is invalid or expired."});
    const membership=await getMembership(user.id);
    if(!membership)return res.status(403).json({error:"Your Supabase account is not assigned to a Customs IDP organisation."});
    const context={organisationId:membership.organisation_id,userId:user.id,email:user.email||"",name:user.user_metadata?.full_name||user.user_metadata?.name||user.email||"",role:membership.role||"member"};
    res.setHeader("Set-Cookie",createAuthCookie(context));
    return res.status(200).json({authenticated:true,user:{id:context.userId,email:context.email,name:context.name,role:context.role},organisation:{id:context.organisationId}});
  }
  if(req.method==="DELETE"){res.setHeader("Set-Cookie",clearAuthCookie());return res.status(200).json({authenticated:false});}
  return res.status(405).json({error:"Method not allowed"});
}
async function getSupabaseUser(accessToken){const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");const key=String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||"sb_publishable_i-IHnlw8Q8BJI-dtBC3WKw_dwVxsE-J");if(!url||!key)throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required for authentication.");const response=await fetch(url+"/auth/v1/user",{headers:{apikey:key,Authorization:"Bearer "+accessToken}});if(!response.ok)return null;return response.json();}
async function getMembership(userId){const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"");if(!url||!key)throw new Error("Supabase service configuration is missing.");const response=await fetch(url+"/rest/v1/organisation_members?user_id=eq."+encodeURIComponent(userId)+"&select=organisation_id,role&limit=1",{headers:{apikey:key,Authorization:"Bearer "+key}});if(!response.ok)throw new Error(await response.text());const rows=await response.json();return rows[0]||null;}