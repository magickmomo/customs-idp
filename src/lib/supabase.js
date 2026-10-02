import { createClient } from "@supabase/supabase-js";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"https://idxlzebqfuomzxtqxrey.supabase.co";
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_i-IHnlw8Q8BJI-dtBC3WKw_dwVxsE-J";

export const authRedirectUrl=()=>{
  const configured=String(process.env.NEXT_PUBLIC_APP_URL||"").trim();
  if(configured)return configured.replace(/\/+$/,"")+"/";
  if(typeof window!=="undefined")return window.location.origin+"/";
  return "https://customs-idp.vercel.app/";
};

export const supabase=createClient(url,key,{
  auth:{
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true
  }
});
