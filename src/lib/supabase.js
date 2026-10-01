import { createClient } from "@supabase/supabase-js";

const url=import.meta.env.VITE_SUPABASE_URL||"https://idxlzebqfuomzxtqxrey.supabase.co";
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_i-IHnlw8Q8BJI-dtBC3WKw_dwVxsE-J";

export const authRedirectUrl=()=>{
  const configured=String(import.meta.env.VITE_APP_URL||"").trim();
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
