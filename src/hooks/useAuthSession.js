import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

export function useAuthSession({ localTestRoute }) {
  const [authenticated,setAuthenticated]=useState(null);
  const [currentUser,setCurrentUser]=useState(null);
  const [passwordSetup,setPasswordSetup]=useState(()=>typeof window!=="undefined"&&/(?:^|[?&#])type=(?:invite|recovery)(?:[&#]|$)/.test(window.location.href));

  useEffect(()=>{
    let active=true;
    const hasPasswordSetupMarker=()=>typeof window!=="undefined"&&/(?:^|[?&#])type=(?:invite|recovery)(?:[&#]|$)/.test(window.location.href);
    const requiresInvitedUserSetup=session=>Boolean(session?.user?.invited_at&&session?.user?.user_metadata?.customs_idp_password_set!==true);
    if(localTestRoute){setAuthenticated(false);return()=>{active=false;};}
    const syncSession=async(session)=>{
      if(!session?.access_token){
        try{await fetch("/api/auth",{method:"DELETE",credentials:"include"});}catch{}
        if(active){setCurrentUser(null);setAuthenticated(false);}
        return;
      }
      try{
        supabase.realtime.setAuth(session.access_token);
        const response=await fetch("/api/auth",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},credentials:"include"});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||"Authentication failed.");
        if(active){if(data.requiresPasswordSetup)setPasswordSetup(true);setCurrentUser(data.user||null);setAuthenticated(true);}
      }catch(error){
        await supabase.auth.signOut().catch(()=>{});
        if(active){setCurrentUser(null);setAuthenticated(false);}
      }
    };
    supabase.auth.getSession().then(({data:{session}})=>{if(active)syncSession(session);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==="SIGNED_OUT"){if(active){setCurrentUser(null);setAuthenticated(false);}}
      else if(event==="PASSWORD_RECOVERY"&&session){setPasswordSetup(true);syncSession(session);}
      else if(event==="SIGNED_IN"&&session){if(hasPasswordSetupMarker()||requiresInvitedUserSetup(session))setPasswordSetup(true);syncSession(session);}
      else if(event==="INITIAL_SESSION"&&session){if(hasPasswordSetupMarker()||requiresInvitedUserSetup(session))setPasswordSetup(true);syncSession(session);}
      else if(session){if(requiresInvitedUserSetup(session))setPasswordSetup(true);syncSession(session);}
    });
    return()=>{active=false;subscription.unsubscribe();};
  },[localTestRoute]);

  return { authenticated, currentUser, passwordSetup, setAuthenticated, setCurrentUser, setPasswordSetup };
}
