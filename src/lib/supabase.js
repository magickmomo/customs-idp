import { createClient } from "@supabase/supabase-js";

const url=import.meta.env.VITE_SUPABASE_URL||"https://idxlzebqfuomzxtqxrey.supabase.co";
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||"sb_publishable_i-IHnlw8Q8BJI-dtBC3WKw_dwVxsE-J";

export const supabase=createClient(url,key,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
