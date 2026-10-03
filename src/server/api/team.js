import { requireAuth } from "./authGuard.js";

export default async function handler(req,res){
  const auth=requireAuth(req,res);
  if(!auth)return;

  if(auth.role!=="admin"&&auth.role!=="manager"){
    return res.status(403).json({error:"Only organisation managers and admins can invite users."});
  }

  if(req.method!=="POST"){
    return res.status(405).json({error:"Method not allowed"});
  }

  try{
    const email=String(req.body?.email||"").trim().toLowerCase();
    const role=String(req.body?.role||"member").trim().toLowerCase();
    const name=String(req.body?.name||"").trim();

    if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      return res.status(400).json({error:"A valid email address is required."});
    }
    if(!["member","manager","admin"].includes(role)){
      return res.status(400).json({error:"Invalid organisation role."});
    }
    if(role==="admin"&&auth.role!=="admin"){
      return res.status(403).json({error:"Only an admin can invite another admin."});
    }

    const existing=await supabaseRest(
      "organisation_members?organisation_id=eq."+encodeURIComponent(auth.organisationId)+"&select=user_id,role"
    );
    if(existing.some(row=>String(row.user_id||"")===String(auth.userId))){
      // Current caller is already a valid member; continue.
    }

    const invited=await supabaseAuthAdmin("/auth/v1/admin/invite",{email,options:{
      redirect_to:getAppUrl()+"/",
      data:{full_name:name}
    }});

    const userId=invited?.user?.id||invited?.id;
    if(!userId)throw new Error("Supabase did not return the invited user's ID.");

    await supabaseRest("organisation_members",{
      method:"POST",
      headers:{"Prefer":"resolution=merge-duplicates,return=representation"},
      body:JSON.stringify({
        organisation_id:auth.organisationId,
        user_id:userId,
        role
      })
    });

    return res.status(200).json({
      invited:true,
      user:{id:userId,email:invited.user?.email||email,name:name||invited.user?.user_metadata?.full_name||email},
      role
    });
  }catch(error){
    const message=error?.message||"Unable to invite team member.";
    if(/already registered|already been registered|already exists/i.test(message)){
      return res.status(409).json({error:"A Supabase account already exists for this email. Remove the existing test account or use password reset instead."});
    }
    return res.status(500).json({error:message});
  }
}

function getAppUrl(){
  const configured=String(process.env.APP_URL||"").trim();
  if(configured)return configured.replace(/\/+$/,"");
  if(process.env.VERCEL_ENV==="production")return "https://customs-idp.vercel.app";
  return "http://localhost:5173";
}

async function supabaseAuthAdmin(path,body){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/+$/,"");
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
  if(!url||!key)throw new Error("Supabase service configuration is missing.");
  const response=await fetch(url+path,{
    method:"POST",
    headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const text=await response.text();
  if(!response.ok)throw new Error(text||"Supabase invitation failed.");
  return text?JSON.parse(text):{};
}

async function supabaseRest(path,options={}){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/+$/,"");
  const key=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
  if(!url||!key)throw new Error("Supabase service configuration is missing.");
  const response=await fetch(url+"/rest/v1/"+path,{
    method:options.method||"GET",
    headers:{
      apikey:key,
      Authorization:"Bearer "+key,
      "Content-Type":"application/json",
      ...(options.headers||{})
    },
    ...(options.body?{body:typeof options.body==="string"?options.body:JSON.stringify(options.body)}:{})
  });
  const text=await response.text();
  if(!response.ok)throw new Error(text||"Supabase database request failed.");
  return text?JSON.parse(text):[];
}
