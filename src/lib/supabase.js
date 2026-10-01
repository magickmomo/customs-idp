import { createClient } from "@supabase/supabase-js";

const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if(!url||!key){
  console.warn("Customs IDP Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
}

export const supabase=createClient(url||"https://placeholder.invalid",key||"placeholder",{
  auth:{
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true
  }
});
