import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

export function useAuthSession({ localTestRoute }) {
  const [authenticated,setAuthenticated]=useState(null);
  const [currentUser,setCurrentUser]=useState(null);
  const [passwordSetup,setPasswordSetup]=useState(false);

  useEffect(()=>{
    let active=true;
    const hasPasswordSetupMarker=()=>typeof window!=="undefined"&&/(?:^|[?&#])type=(?:invite|recovery)(?:[&#]|$)/.test(window.location.href);
    const requiresInvitedUserSetup=session=>Boolean(session?.user?.invited_at&&session?.user?.user_metadata?.customs_idp_password_set!==true);
    if(localTestRoute){setAuthenticated(false);return()=>{active=false;};}

    const syncSession=async(session)=>{
      if(!session?.access_token){
        try{await fetch("/api/auth",{method:"DELETE",credentials:"include"});}catch{}
        if(active){setCurrentUser(null);setAuthenticated(false);setPasswordSetup(false);}
        return;
      }
      try{
        supabase.realtime.setAuth(session.access_token);
        const response=await fetch("/api/auth",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},credentials:"include"});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||"Authentication failed.");
        const needsSetup=hasPasswordSetupMarker()||requiresInvitedUserSetup(session);
        if(active){
          setPasswordSetup(needsSetup);
          setCurrentUser(data.user||null);
          setAuthenticated(true);
        }
      }catch(error){
        await supabase.auth.signOut().catch(()=>{});
        if(active){setCurrentUser(null);setAuthenticated(false);setPasswordSetup(false);}
      }
    };

    supabase.auth.getSession().then(({data:{session}})=>{
      if(active)syncSession(session);
    });

    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==="SIGNED_OUT"){
        if(active){setCurrentUser(null);setAuthenticated(false);setPasswordSetup(false);}
      } else if(session){
        if(event==="PASSWORD_RECOVERY"||event==="SIGNED_IN"||event==="INITIAL_SESSION"){
          syncSession(session);
        } else {
          syncSession(session);
        }
      }
    });

    return()=>{active=false;subscription.unsubscribe();};
  },[localTestRoute]);

  return { authenticated, currentUser, passwordSetup, setAuthenticated, setCurrentUser, setPasswordSetup };
}
