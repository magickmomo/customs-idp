import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { shouldEnterPasswordSetup } from "../auth/passwordRecovery.js";

export function useAuthSession({ localTestRoute }) {
  const [authenticated,setAuthenticated]=useState(null);
  const [currentUser,setCurrentUser]=useState(null);
  const [passwordSetup,setPasswordSetup]=useState(false);

  useEffect(()=>{
    let active=true;
    if(localTestRoute){setAuthenticated(false);return()=>{active=false;};}

    const syncSession=async(session,event="")=>{
      if(!session?.access_token){
        try{await fetch("/api/auth",{method:"DELETE",credentials:"include"});}catch{}
        if(active){setCurrentUser(null);setAuthenticated(false);setPasswordSetup(false);}
        return;
      }

      const needsSetup=shouldEnterPasswordSetup({
        event,
        session,
        locationLike:typeof window!=="undefined"?window.location:undefined
      });
      if(needsSetup){
        if(active){setCurrentUser(null);setAuthenticated(false);setPasswordSetup(true);}
        return;
      }

      try{
        supabase.realtime.setAuth(session.access_token);
        const response=await fetch("/api/auth",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},credentials:"include"});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||"Authentication failed.");
        if(active){
          setPasswordSetup(false);
          setCurrentUser(data.user||null);
          setAuthenticated(true);
        }
      }catch(error){
        await supabase.auth.signOut().catch(()=>{});
        if(active){setCurrentUser(null);setAuthenticated(false);setPasswordSetup(false);}
      }
    };

    supabase.auth.getSession().then(({data:{session}})=>{
      if(active)syncSession(session,"INITIAL_SESSION");
    });

    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==="SIGNED_OUT"){
        if(active){setCurrentUser(null);setAuthenticated(false);setPasswordSetup(false);}
      } else if(session){
        syncSession(session,event);
      }
    });

    return()=>{active=false;subscription.unsubscribe();};
  },[localTestRoute]);

  return { authenticated, currentUser, passwordSetup, setAuthenticated, setCurrentUser, setPasswordSetup };
}
