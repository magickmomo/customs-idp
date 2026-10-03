import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { customerStrategyStore, normaliseDatabasePack } from "../domain/packData.js";

export function usePackWorkspace({ authenticated }) {
const localPacksRef=useRef([]);
  try{
    if(typeof window!=="undefined"){
      const saved=localStorage.getItem("customs-idp-packs");
      localPacksRef.current=saved?JSON.parse(saved):[];
    }
  }catch{
    localPacksRef.current=[];
  }
  const [livePacks,setLivePacks]=useState([]);

  const [dataSource,setDataSource]=useState("local");
  const [packsLoading,setPacksLoading]=useState(true);
  const [packLoadError,setPackLoadError]=useState("");
  const [emailSyncStatus,setEmailSyncStatus]=useState({state:"ready",checked:0,processed:0,duplicates:0,failed:0,error:"",message:"Webhook intake active; recovery scan is secondary."});
  const [pendingUploadFiles,setPendingUploadFiles]=useState([]),[uploadCustomer,setUploadCustomer]=useState("Unassigned customer"),[showUploadConfirm,setShowUploadConfirm]=useState(false);
  useEffect(()=>{
    if(authenticated!==true)return;
    let active=true;
    setPacksLoading(true);
    let syncTimer=null;
    const loadDatabasePacks=async()=>{
      const packsResponse=await fetch("/api/packs",{credentials:"include"});
      const packsData=await packsResponse.json().catch(()=>({}));
      if(packsResponse.ok&&Array.isArray(packsData.packs)){
        setLivePacks(packsData.packs);
        setPackLoadError("");
        setDataSource("database");
        return packsData.packs;
      }

      // The browser already has an authenticated Supabase session. Fall back to
      // the RLS-protected table directly so a stale/missing server auth cookie
      // cannot leave the Inbox showing prototype data while the database has live packs.
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token) throw new Error(packsData.error||("Pack database returned HTTP "+packsResponse.status));
      supabase.realtime.setAuth(session.access_token);
      const {data,error}=await supabase.from("document_packs").select("*").order("created_at",{ascending:false});
      if(error) throw new Error(error.message);
      const normalized=(data||[]).map(normaliseDatabasePack);
      setLivePacks(normalized);
      setPackLoadError("");
      setDataSource("database");
      return normalized;
    };

    // Webhooks are the primary mailbox intake path. This scan is deliberately
    // secondary and starts later, so opening the Inbox does not poll Outlook.
    const runMailboxRecoveryScan=async()=>{
      try{
        setEmailSyncStatus(state=>({...state,state:"syncing",error:"",message:""}));
        const response=await fetch("/api/outlook?action=sync",{method:"POST",credentials:"include"});
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||("Outlook sync returned HTTP "+response.status));
        if(active){
          setEmailSyncStatus({state:"ready",checked:Number(data.checked||0),processed:Number(data.processed||0),duplicates:Number(data.duplicates||0),failed:Number(data.failed||0),error:"",message:"Recovery scan complete; webhook intake remains primary."});
          await loadDatabasePacks();
        }
      }catch(error){
        if(active)setEmailSyncStatus(state=>({...state,state:"error",error:error?.message||"Outlook sync failed."}));
      }
    };
    const recoveryScanDelay=5*60*1000;
    const recoveryScanTimer=window.setTimeout(()=>{
      if(!active)return;
      void runMailboxRecoveryScan();
      syncTimer=window.setInterval(runMailboxRecoveryScan,15*60*1000);
    },recoveryScanDelay);
    const inboxRefreshTimer=window.setInterval(async()=>{
      try{ if(active) await loadDatabasePacks(); }catch(error){ if(active) setPackLoadError(error?.message||"Unable to refresh organisation packs."); }
    },5000);
    (async()=>{
      try {
        // Load the active organisation's customers and strategy configuration.
        // This replaces the prototype-only hard-coded strategy map for live workflow decisions.
        try{
          const organisationResponse=await fetch("/api/organisation?action=customers",{credentials:"include"});
          const organisationData=await organisationResponse.json().catch(()=>({}));
          if(organisationResponse.ok&&Array.isArray(organisationData.customers)){
            organisationData.customers.forEach(customer=>{
              customerStrategyStore[customer.name]={
                ...(customer.strategy||{}),
                autoApplyWeightApportionment:customer.strategy?.autoApplyWeightApportionment===true,
                emailFields:Array.isArray(customer.strategy?.emailFields)?customer.strategy.emailFields:[]
              };
            });
          }
        }catch{}

        // Load persisted packs immediately. Outlook intake is webhook-driven; mailbox
        // scanning is intentionally not part of application startup.
        const data=await loadDatabasePacks();
        if(active && Array.isArray(data) && data.length){
          // Keep browser-stored document metadata when older database rows pre-date
          // persistent uploadedFiles support, and prefer database metadata once present.
          const localPackMap=new Map((localPacksRef.current||[]).map(pack=>[pack.id,pack]));
          const nextPacks=data.map(pack=>{
            const local=localPackMap.get(pack.id);
            return pack.uploadedFiles?.length ? pack : (local?.uploadedFiles?.length ? {...pack,uploadedFiles:local.uploadedFiles} : pack);
          });
          setLivePacks(nextPacks);
        }
      } catch(error) {
        // Do not silently display the four prototype packs when the live
        // organisation database cannot be loaded. That masks production
        // data problems and makes new deployments look empty/stale.
        if(active){
          setPackLoadError(error?.message||"Unable to load organisation packs.");
          setDataSource("error");
        }
      } finally {
        if(active)setPacksLoading(false);
      }
    })();
    return()=>{active=false;window.clearTimeout(recoveryScanTimer);if(syncTimer)window.clearInterval(syncTimer);if(inboxRefreshTimer)window.clearInterval(inboxRefreshTimer);};
  },[authenticated]);
  // Supabase Realtime keeps an open inbox current as soon as the database changes.
  // RLS on document_packs limits each authenticated user to their organisation.
  useEffect(()=>{
    if(authenticated!==true)return;
    let active=true;
    let channel=null;
    const refreshPacks=async()=>{
      try{
        const response=await fetch("/api/packs",{credentials:"include"});
        const data=await response.json().catch(()=>({}));
        if(active&&response.ok&&Array.isArray(data.packs)) setLivePacks(data.packs);
      }catch{}
    };
    (async()=>{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token)return;
      supabase.realtime.setAuth(session.access_token);
      channel=supabase.channel("document-packs-live")
        .on("postgres_changes",{event:"*",schema:"public",table:"document_packs"},()=>{void refreshPacks();})
        .subscribe();
    })();
    return()=>{active=false;if(channel)supabase.removeChannel(channel);};
  },[authenticated]);

  useEffect(()=>{ if(dataSource!=="database")return; try { localStorage.setItem("customs-idp-packs",JSON.stringify(livePacks)); } catch {} },[livePacks,dataSource]);
  const persistPack=async(pack)=>{
    const save=async()=>{
      const response=await fetch("/api/packs",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify(pack)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error||("Database save failed (HTTP "+response.status+")"));
      setDataSource("database");
      return true;
    };
    try{
      return await save();
    }catch(firstError){
      // Refresh the server-side session bridge if the browser Supabase session
      // is valid but the Customs IDP auth cookie has expired.
      try{
        const {data:{session}}=await supabase.auth.getSession();
        if(session?.access_token){
          const authResponse=await fetch("/api/auth",{method:"POST",headers:{Authorization:"Bearer "+session.access_token},credentials:"include"});
          if(authResponse.ok)return await save();
        }
      }catch{}
      setPackLoadError(firstError?.message||"Database save failed");
      return false;
    }
  };
  return { livePacks, setLivePacks, dataSource, packsLoading, packLoadError, setPackLoadError, emailSyncStatus, persistPack };
}
