import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, AlertCircle, ArrowRight, Bot, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FileText,
  Inbox, Mail, Menu, MoreHorizontal, Package, Plus, Search,
  Settings, ShieldCheck, Sparkles, Users, X, Zap
} from "lucide-react";
import "./styles.css";
import { validateStandardCustomsRecord } from "./validation/standardEngine.js";
import { DEFAULT_ORGANISATION } from "./tenant.js";
import { supabase } from "./lib/supabase.js";

const packs = [
  { organisationId:DEFAULT_ORGANISATION.id, organisationName:DEFAULT_ORGANISATION.name, id:"PK-10482", customer:"Acme Components Ltd", docs:4, status:"Needs review", confidence:91, received:"16 Sep 2026, 15:42", ticket:"TK-88421" },
  { organisationId:DEFAULT_ORGANISATION.id, organisationName:DEFAULT_ORGANISATION.name, id:"PK-10481", customer:"Northstar Manufacturing", docs:7, status:"Processing", confidence:96, received:"16 Sep 2026, 15:38", ticket:"TK-88420" },
  { organisationId:DEFAULT_ORGANISATION.id, organisationName:DEFAULT_ORGANISATION.name, id:"PK-10480", customer:"Bancale Trading", docs:3, status:"Validated", confidence:98, received:"16 Sep 2026, 15:31", ticket:"TK-88419" },
  { organisationId:DEFAULT_ORGANISATION.id, organisationName:DEFAULT_ORGANISATION.name, id:"PK-10479", customer:"Raven Industrial", docs:5, status:"Needs review", confidence:88, received:"16 Sep 2026, 15:12", ticket:"TK-88418" }
];

const customerStrategies = {
  "Acme Components Ltd": { autoApplyWeightApportionment: false, emailFields: [] },
  "Northstar Manufacturing": { autoApplyWeightApportionment: false, emailFields: [] },
  "Bancale Trading": { autoApplyWeightApportionment: false, emailFields: [] },
  "Raven Industrial": { autoApplyWeightApportionment: false, emailFields: [] }
};

const customerStrategyStore = { ...customerStrategies };

const getCustomerStrategy = customer =>
  customerStrategyStore[customer] || { autoApplyWeightApportionment: false, emailFields: [] };

const customers = [
  {name:"Acme Components Ltd", code:"ACME-001", mailbox:"customs.acme@inbox.example", rules:12, processed:"2,481"},
  {name:"Northstar Manufacturing", code:"NSTM-014", mailbox:"customs.northstar@inbox.example", rules:8, processed:"1,972"},
  {name:"Bancale Trading", code:"BANC-007", mailbox:"customs.bancale@inbox.example", rules:15, processed:"3,108"},
  {name:"Raven Industrial", code:"RAVN-021", mailbox:"customs.raven@inbox.example", rules:6, processed:"1,406"}
];

const DOC_DB_NAME="customs-idp-documents";
const DOC_STORE="files";
function openDocDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DOC_DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(DOC_STORE))req.result.createObjectStore(DOC_STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function saveUploadedDocument(id,file){const db=await openDocDb();return new Promise((resolve,reject)=>{const tx=db.transaction(DOC_STORE,"readwrite");tx.objectStore(DOC_STORE).put(file,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function getUploadedDocument(id){const db=await openDocDb();return new Promise((resolve,reject)=>{const tx=db.transaction(DOC_STORE,"readonly");const req=tx.objectStore(DOC_STORE).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}

const sampleLines = [
  {line:1,description:"Oak wooden packaging boxes",hs:"4415 10 00",origin:"HU",qty:24,net:"10.080",gross:"11.420",value:"384.00",confidence:97},
  {line:2,description:"Bancale Legno pallets",hs:"4415 20 90",origin:"IT",qty:6,net:"0.000",gross:"3.180",value:"120.00",confidence:93},
  {line:3,description:"Protective timber spacers",hs:"4415 10 90",origin:"HU",qty:18,net:"7.560",gross:"8.410",value:"216.00",confidence:94}
];


const normalizeCountryCode=value=>{
  const raw=String(value??"").trim();
  const upper=raw.toUpperCase();
  const map={"UNITED KINGDOM":"GB","GREAT BRITAIN":"GB","UK":"GB","ENGLAND":"GB","SCOTLAND":"GB","WALES":"GB","NORTHERN IRELAND":"GB"};
  return map[upper]||upper;
};

function SupabasePasswordSetup({onComplete}){const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);const submit=async(e)=>{e.preventDefault();setError("");if(password.length<8){setError("Password must be at least 8 characters.");return;}if(password!==confirm){setError("Passwords do not match.");return;}setBusy(true);try{const {data,error:updateError}=await supabase.auth.updateUser({password,data:{customs_idp_password_set:true}});if(updateError)throw updateError;const sessionResult=await supabase.auth.getSession();const token=sessionResult.data.session?.access_token;if(!token)throw new Error("Your authentication session could not be established.");const response=await fetch("/api/auth",{method:"POST",headers:{Authorization:"Bearer "+token},credentials:"include"});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Your account is not authorised for Customs IDP.");window.history.replaceState({},document.title,window.location.pathname+window.location.search);onComplete(result.user);}catch(error){setError(error.message||"Unable to set password");}finally{setBusy(false);}};return <div className="test-login"><div className="test-login-card"><div className="test-login-brand"><div className="brand-mark"><Zap size={18}/></div><div><strong>Customs IDP</strong><span>Intelligent Data Processing</span></div></div><div className="test-login-copy"><div className="eyebrow">Account setup</div><h1>Set your password</h1><p>Choose a password for your Customs IDP account. You can use it for future sign-ins.</p></div><form onSubmit={submit} className="password-login-form"><label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoFocus autoComplete="new-password" placeholder="At least 8 characters"/></label><label>Confirm password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" placeholder="Enter it again"/></label>{error&&<div className="password-login-error">{error}</div>}<button className="primary-action password-login-submit" type="submit" disabled={busy||!password||!confirm}>{busy?"Saving…":"Set password"}</button></form></div></div>;}

function SupabaseLogin({onSuccess}){const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [error,setError]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);const [resetSent,setResetSent]=useState(false);const submit=async(e)=>{e.preventDefault();setError("");setMessage("");setBusy(true);try{const {data,error:signInError}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(signInError)throw signInError;if(!data.session?.access_token)throw new Error("Supabase did not return an active session.");const response=await fetch("/api/auth",{method:"POST",headers:{Authorization:"Bearer "+data.session.access_token},credentials:"include"});const result=await response.json().catch(()=>({}));if(!response.ok){await supabase.auth.signOut();throw new Error(result.error||"Your account is not authorised for Customs IDP.");}onSuccess(result.user);}catch(error){setError(error.message||"Unable to sign in");}finally{setBusy(false);}};const sendReset=async()=>{setError("");setMessage("");if(!email.trim()){setError("Enter your email address first.");return;}setBusy(true);try{const {error:resetError}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin+"/"});if(resetError)throw resetError;setResetSent(true);setMessage("Password setup/reset email sent. Check your inbox and follow the link.");}catch(error){setError(error.message||"Unable to send password reset email");}finally{setBusy(false);}};return <div className="test-login"><div className="test-login-card"><div className="test-login-brand"><div className="brand-mark"><Zap size={18}/></div><div><strong>Customs IDP</strong><span>Intelligent Data Processing</span></div></div><div className="test-login-copy"><div className="eyebrow">Secure access</div><h1>Sign in</h1><p>Use your Customs IDP account. Authentication is managed by Supabase.</p></div><form onSubmit={submit} className="password-login-form"><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoFocus autoComplete="username" placeholder="name@company.com"/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter password"/></label>{error&&<div className="password-login-error">{error}</div>}{message&&<div className="password-login-message">{message}</div>}<button className="primary-action password-login-submit" type="submit" disabled={busy||!email.trim()||!password}>{busy?"Signing in…":"Sign in"}</button><button type="button" className="secondary-action" onClick={sendReset} disabled={busy||!email.trim()}>{resetSent?"Send setup/reset email again":"Set or reset password"}</button></form></div></div>;}

function App(){
  const [authenticated,setAuthenticated]=useState(null);
  const [currentUser,setCurrentUser]=useState(null);
  const hasPasswordSetupMarker=()=>typeof window!=="undefined" && /(?:^|[?&#])type=(?:invite|recovery)(?:[&#]|$)/.test(window.location.href);
  const requiresInvitedUserSetup=session=>Boolean(session?.user?.invited_at && session?.user?.user_metadata?.customs_idp_password_set!==true);
  const [passwordSetup,setPasswordSetup]=useState(()=>hasPasswordSetupMarker());

  useEffect(()=>{
    let active=true;
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
        if(active){if(requiresInvitedUserSetup(session))setPasswordSetup(true);setCurrentUser(data.user||null);setAuthenticated(true);}
      }catch(error){
        await supabase.auth.signOut().catch(()=>{});
        if(active){setCurrentUser(null);setAuthenticated(false);}
      }
    };
    supabase.auth.getSession().then(({data:{session}})=>{if(active)syncSession(session);});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==="SIGNED_OUT"){if(active){setCurrentUser(null);setAuthenticated(false);}}
      else if(event==="PASSWORD_RECOVERY" && session){setPasswordSetup(true);syncSession(session);}
      else if(event==="SIGNED_IN" && session){if(hasPasswordSetupMarker()||requiresInvitedUserSetup(session))setPasswordSetup(true);syncSession(session);}
      else if(event==="INITIAL_SESSION" && session){if(hasPasswordSetupMarker()||requiresInvitedUserSetup(session))setPasswordSetup(true);syncSession(session);}
      else if(session){if(requiresInvitedUserSetup(session))setPasswordSetup(true);syncSession(session);}
    });
    return()=>{active=false;subscription.unsubscribe();};
  },[]);
  const [page,setPage]=useState("inbox");
  const [selectedPack,setSelectedPack]=useState(packs[0]);
  const [agentOpen,setAgentOpen]=useState(true);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const currentUserRole=currentUser?.role||"";
  const currentUserName=currentUser?.name||"";
  const currentUserInitials=currentUser?.initials||"";
  const canViewManager=currentUserRole==="manager" || currentUserRole==="admin";
  const [query,setQuery]=useState("");
  const [toast,setToast]=useState("");
  const [livePacks,setLivePacks]=useState(()=>{
    try { const saved=localStorage.getItem("customs-idp-packs"); return saved ? JSON.parse(saved) : packs; }
    catch { return packs; }
  });
  const [dataSource,setDataSource]=useState("local");
  const [packLoadError,setPackLoadError]=useState("");
  const [emailSyncStatus,setEmailSyncStatus]=useState({state:"idle",checked:0,processed:0,duplicates:0,failed:0,error:""});
  useEffect(()=>{
    if(authenticated!==true)return;
    let active=true;
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
        const response=await fetch("/api/packs",{credentials:"include"});
        const data=await response.json().catch(()=>({}));
        if(!response.ok) throw new Error(data.error||("Pack database returned HTTP "+response.status));
        if(active && Array.isArray(data.packs)){
          setPackLoadError("");
  if(data.packs.length){
    // Keep browser-stored document metadata when older database rows pre-date
    // persistent uploadedFiles support, and prefer database metadata once present.
    const localPackMap=new Map((livePacks||[]).map(pack=>[pack.id,pack]));
    let nextPacks=data.packs.map(pack=>{
      const local=localPackMap.get(pack.id);
      return pack.uploadedFiles?.length ? pack : (local?.uploadedFiles?.length ? {...pack,uploadedFiles:local.uploadedFiles} : pack);
    });
    setLivePacks(nextPacks);
    // Backfill document metadata to Supabase for packs restored from local browser storage.
    const restoredWithDocuments=nextPacks.filter(pack=>{
      const local=localPackMap.get(pack.id);
      return !data.packs.find(dbPack=>dbPack.id===pack.id)?.uploadedFiles?.length && local?.uploadedFiles?.length;
    });
    if(restoredWithDocuments.length){
      await Promise.all(restoredWithDocuments.map(pack=>fetch("/api/packs",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(pack)
      })));
    }
  } else if(livePacks.length){
    await Promise.all(livePacks.map(pack=>fetch("/api/packs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(pack)})));
  }
  setDataSource("database");
}
      } catch(error) {
        // Do not silently display the four prototype packs when the live
        // organisation database cannot be loaded. That masks production
        // data problems and makes new deployments look empty/stale.
        if(active){
          setPackLoadError(error?.message||"Unable to load organisation packs.");
          setDataSource("error");
        }
      }
    })();
    return()=>{active=false;};
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

  useEffect(()=>{ try { localStorage.setItem("customs-idp-packs",JSON.stringify(livePacks)); } catch {} },[livePacks]);
  const persistPack=async(pack)=>{
    try{
      const response=await fetch("/api/packs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(pack)});
      if(!response.ok) throw new Error("Database save failed");
      setDataSource("database");
      return true;
    }catch{return false;}
  };
  const uploadRef=useRef(null);
  const reprocessPack=async(pack)=>{
    if(!pack)return;
    let files=Array.isArray(pack.uploadedFiles)?[...pack.uploadedFiles]:[];
    if(!files.length){
      try{
        const listResponse=await fetch("/api/storage",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"list-pack",packId:pack.id})
        });
        const listData=await listResponse.json().catch(()=>({}));
        if(listResponse.ok&&Array.isArray(listData.files)&&listData.files.length){
          files=listData.files.map(file=>({
            id:file.id,
            name:file.name,
            size:file.size||0,
            type:file.type||"application/octet-stream",
            storagePath:file.storagePath
          }));
          pack={...pack,uploadedFiles:files,docs:Math.max(Number(pack.docs)||0,files.length)};
          setSelectedPack(pack);
          setLivePacks(prev=>prev.map(p=>p.id===pack.id?pack:p));
          await persistPack(pack);
        }
      }catch{}
    }else{
      // Older email-created packs may have document metadata but no storagePath.
      // Recover the persisted source files from the pack folder before falling
      // back to browser IndexedDB, which is not available for email intake.
      const missingStorage=files.some(file=>!file.storagePath);
      if(missingStorage){
        try{
          const listResponse=await fetch("/api/storage",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({action:"list-pack",packId:pack.id})
          });
          const listData=await listResponse.json().catch(()=>({}));
          if(listResponse.ok&&Array.isArray(listData.files)&&listData.files.length){
            files=files.map(file=>{
              if(file.storagePath)return file;
              const match=listData.files.find(stored=>stored.name===file.name||stored.name===file.name.replace(/^\\d+-/,""));
              return match?{...file,storagePath:match.storagePath,size:file.size||match.size||0,type:file.type||match.type}:file;
            });
            pack={...pack,uploadedFiles:files};
            setSelectedPack(pack);
            setLivePacks(prev=>prev.map(p=>p.id===pack.id?pack:p));
            await persistPack(pack);
          }
        }catch{}
      }
    }
    if(!files.length){notify("No uploaded documents are available to reprocess");return;}
    const processing={...pack,uploadedFiles:files,status:"Processing",processingError:undefined,validationStatus:undefined,validationChecks:undefined,postedToLCAAt:undefined};
    setSelectedPack(processing);setLivePacks(prev=>prev.map(p=>p.id===pack.id?processing:p));persistPack(processing);notify("Re-processing all documents — AI extraction started");
    try{
      const extractedDocuments=[];
      for(const uploaded of files){
        let source=null;
        if(uploaded.storagePath){
          const sr=await fetch("/api/storage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"signed-url",path:uploaded.storagePath})});
          const sd=await sr.json().catch(()=>({}));
          if(!sr.ok)throw new Error("Storage access failed for "+uploaded.name+": "+(sd.error||("HTTP "+sr.status)));
          if(!sd.signedUrl)throw new Error("Storage access failed for "+uploaded.name+": no signed URL was returned");
          const fr=await fetch(sd.signedUrl);
          if(!fr.ok)throw new Error("Document download failed for "+uploaded.name+": HTTP "+fr.status);
          source=await fr.blob();
        }else{
          source=await getUploadedDocument(uploaded.id);
        }
        if(!source)throw new Error("Uploaded document is unavailable: "+uploaded.name);

        let binary="";
        try{
          const bytes=new Uint8Array(await source.arrayBuffer());
          for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
        }catch(error){
          throw new Error("Could not read document "+uploaded.name+": "+(error.message||"unknown read error"));
        }

        const mimeType=source.type||uploaded.type||"application/octet-stream";
        const response=await fetch("/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileData:"data:"+mimeType+";base64,"+btoa(binary),filename:uploaded.name,mimeType})});
        const result=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error("Extraction failed for "+uploaded.name+": "+(result.error||("HTTP "+response.status)));
        if(!result.extraction)throw new Error("Extraction failed for "+uploaded.name+": no extraction result was returned");
        extractedDocuments.push({id:uploaded.id,filename:uploaded.name,mimeType,extraction:result.extraction});
      }
      const confidences=extractedDocuments.map(d=>Number(d.extraction?.confidence)||0).filter(Boolean);
      const primaryDoc=extractedDocuments.find(d=>d.extraction?.documentType==="commercial_invoice")||extractedDocuments[0];
      const processed={...processing,status:"Needs review",confidence:confidences.length?Math.round(confidences.reduce((a,b)=>a+b,0)/confidences.length*100):0,extractedData:{...(primaryDoc?.extraction||{}),documents:extractedDocuments,documentCount:extractedDocuments.length,sourceDocuments:extractedDocuments.map(d=>({id:d.id,filename:d.filename,mimeType:d.mimeType,documentType:d.extraction?.documentType||"unknown",confidence:d.extraction?.confidence||0})),agentMessages:[],extractionRunId:new Date().toISOString()}};
      const validated=buildValidatedPack(processed);
      setSelectedPack(validated);setLivePacks(prev=>prev.map(p=>p.id===validated.id?validated:p));
      const saved=await persistPack(validated);
      if(!saved)throw new Error("Database save failed after re-processing completed");
      notify("Re-processing complete — "+extractedDocuments.length+" documents extracted and validation completed");
    }catch(error){
      const message=error?.message||"Unknown re-processing error";
      const failed={...processing,status:"Needs review",processingError:message};
      setSelectedPack(failed);setLivePacks(prev=>prev.map(p=>p.id===failed.id?failed:p));
      await persistPack(failed);
      notify("Re-processing failed: "+message);
    }
  };

  const handleUpload=async(files)=>{
    const selected=Array.from(files||[]);
    if(!selected.length) return;
    const file=selected[0];
    const highest=livePacks.reduce((max,p)=>Math.max(max,Number(String(p.id||"").replace("PK-",""))||0),10482);
    const id=`PK-${highest+1}`;
    const processingStartedAt=new Date().toISOString();
    let uploadedFiles;
    try{
      uploadedFiles=await Promise.all(selected.map(async(f,index)=>{
        const localId=`${id}-${index}`;
        await saveUploadedDocument(localId,f);
        const storageResponse=await fetch("/api/storage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"upload-url",packId:id,filename:f.name,contentType:f.type})});
        const storageData=await storageResponse.json();
        if(!storageResponse.ok) throw new Error(storageData.error||"Could not create storage upload URL");
        const uploadResponse=await fetch(storageData.signedUrl,{method:"PUT",headers:{"Content-Type":f.type||"application/octet-stream"},body:f});
        if(!uploadResponse.ok) throw new Error(`Could not upload ${f.name} to document storage`);
        return {id:localId,name:f.name,size:f.size,type:f.type,storagePath:storageData.path};
      }));
    }catch(error){
      notify(`Document storage upload failed: ${error.message}`);
      return;
    }
    const newPack={organisationId:DEFAULT_ORGANISATION.id,organisationName:DEFAULT_ORGANISATION.name,id,customer:"Unassigned customer",docs:selected.length,status:"Processing",confidence:0,received:processingStartedAt,processingStartedAt,ticket:`UPLOAD-${Date.now().toString().slice(-5)}`,assignedTo:"Unassigned",uploadedFiles};
    setLivePacks(prev=>[newPack,...prev]);
    persistPack(newPack);
    setSelectedPack(newPack);
    navigate("review");
    notify("Document uploaded — AI extraction started");
    try {
      const extractedDocuments=[];
      for(const uploaded of uploadedFiles){
        let source=null;
        const original=selected.find(f=>f.name===uploaded.name && f.size===uploaded.size) || selected.find(f=>f.name===uploaded.name);
        if(original){
          source=original;
        }else if(uploaded.storagePath){
          const storageResponse=await fetch("/api/storage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"signed-url",path:uploaded.storagePath})});
          const storageData=await storageResponse.json();
          if(!storageResponse.ok) throw new Error(storageData.error||`Could not open ${uploaded.name}`);
          const fileResponse=await fetch(storageData.signedUrl);
          if(!fileResponse.ok) throw new Error(`Could not download ${uploaded.name}`);
          source=await fileResponse.blob();
        }
        if(!source) throw new Error(`Document ${uploaded.name} is unavailable`);
        const buffer=await source.arrayBuffer();
        const bytes=new Uint8Array(buffer);
        let binary="";
        const chunk=0x8000;
        for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
        const dataUrl=`data:${source.type || uploaded.type || "application/octet-stream"};base64,${btoa(binary)}`;
        const response=await fetch("/api/extract",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({fileData:dataUrl,filename:uploaded.name,mimeType:source.type || uploaded.type})
        });
        const result=await response.json();
        if(!response.ok) throw new Error(result.error || `Extraction failed for ${uploaded.name}`);
        extractedDocuments.push({
          id:uploaded.id,
          filename:uploaded.name,
          mimeType:source.type || uploaded.type,
          extraction:result.extraction
        });
      }
      const confidences=extractedDocuments.map(d=>Number(d.extraction?.confidence)||0).filter(v=>v>0);
      const firstInvoice=extractedDocuments.find(d=>d.extraction?.documentType==="commercial_invoice") || extractedDocuments[0];
      const primary=firstInvoice?.extraction||{};
      const processed={
        ...newPack,
        status:"Needs review",
        confidence:confidences.length?Math.round((confidences.reduce((a,b)=>a+b,0)/confidences.length)*100):0,
        extractedData:{
          ...primary,
          documents:extractedDocuments,
          documentCount:extractedDocuments.length,
          sourceDocuments:extractedDocuments.map(d=>({id:d.id,filename:d.filename,mimeType:d.mimeType,documentType:d.extraction?.documentType||"unknown",confidence:d.extraction?.confidence||0}))
        }
      };
      const validated=buildValidatedPack(processed);
      setSelectedPack(validated);
      setLivePacks(prev=>prev.map(p=>p.id===id?validated:p));
      persistPack(validated);
      notify(extractedDocuments.length+" document"+(extractedDocuments.length===1?"":"s")+" extracted and validation completed");
    } catch(error) {
      const failed={...newPack,status:"Needs review",processingError:error.message};
      setSelectedPack(failed);
      setLivePacks(prev=>prev.map(p=>p.id===id?failed:p));
      persistPack(failed);
      notify("Extraction failed — check the pack for details");
    }
  };

  const filteredPacks=useMemo(()=>livePacks.filter(p=>
    [p.id,p.customer,p.status,p.ticket].join(" ").toLowerCase().includes(query.toLowerCase())
  ),[livePacks,query]);

  const navigate=(p)=>{setPage(p);setMobileMenuOpen(false);};
  const notify=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),2500)};
  const assignPack=(packId,assignedTo)=>{const updated={...livePacks.find(p=>p.id===packId),assignedTo};setLivePacks(prev=>prev.map(p=>p.id===packId?updated:p));if(selectedPack?.id===packId)setSelectedPack(prev=>({...prev,assignedTo}));persistPack(updated);notify(`Pack ${packId} assigned to ${assignedTo}`)};
  const updatePack=(pack)=>{
    if(!pack)return;
    setSelectedPack(pack);
    setLivePacks(prev=>prev.map(p=>p.id===pack.id?pack:p));
    persistPack(pack);
  };
  const buildWorkingCustomsRecord=(pack)=>{
    const primary={...(pack?.extractedData||{})};
    const docs=Array.isArray(primary.documents)?primary.documents:[];
    const invoiceDoc=docs.find(d=>d?.extraction?.documentType==="commercial_invoice")||docs[0];
    const supportingDocs=docs.filter(d=>d&&d!==invoiceDoc);
    if(!invoiceDoc)return primary;

    const invoice={...primary};
    const isMissing=v=>v===undefined||v===null||v==="";
    ["countryOfExport","sourceCountryOfDestination","exporterCountryIso","consigneeCountryIso"].forEach(field=>{
      if(!isMissing(invoice[field])) invoice[field]=normalizeCountryCode(invoice[field]);
    });

    // The primary document always wins. Supporting documents only fill fields
    // that are genuinely absent from the primary extraction.
    const supportingValues=(key)=>{
      for(const doc of supportingDocs){
        const value=doc?.extraction?.[key];
        if(!isMissing(value))return value;
      }
      return undefined;
    };

    const merged={...invoice};
    const topLevelKeys=new Set();
    supportingDocs.forEach(doc=>{
      Object.keys(doc?.extraction||{}).forEach(key=>{
        if(key!=="lines"&&key!=="documents"&&key!=="sourceDocuments"&&key!=="agentMessages")topLevelKeys.add(key);
      });
    });
    topLevelKeys.forEach(key=>{
      if(isMissing(merged[key])){
        const value=supportingValues(key);
        if(!isMissing(value))merged[key]=value;
      }
    });

    // Explicit aliases cover common naming differences between document types.
    const aliases={
      exporterEoriNo:["exporterEoriNo","exporterEori","eori"],
      totalPackages:["totalPackages","packages"],
      totalNetWeight:["totalNetWeight","totalNetMass","netWeight"],
      totalGrossWeight:["totalGrossWeight","totalGrossMass","grossWeight"],
      countryOfExport:["countryOfExport","countryOfOrigin","sourceCountryCode"],
      sourceCountryOfDestination:["sourceCountryOfDestination","countryOfDestination"],
      deliveryTerm:["deliveryTerm","terms"]
    };
    Object.entries(aliases).forEach(([target,keys])=>{
      if(!isMissing(merged[target]))return;
      for(const key of keys){
        const value=merged[key]??supportingValues(key);
        if(!isMissing(value)){merged[target]=value;break;}
      }
    });

    const invoiceLines=Array.isArray(invoice.lines)?invoice.lines:[];
    const supportingLineSets=supportingDocs
      .map(doc=>({doc,lines:Array.isArray(doc?.extraction?.lines)?doc.extraction.lines:[]}))
      .filter(x=>x.lines.length);
    const norm=v=>String(v??"").trim().toLowerCase().replace(/\\s+/g," ");
    const findMatch=(invLine,sourceLines)=>{
      const hs=String(invLine?.hsCode??"").trim();
      const desc=norm(invLine?.description);
      return sourceLines.find(line=>hs&&String(line?.hsCode??"").trim()===hs&&desc&&norm(line?.description)===desc)
        ||sourceLines.find(line=>desc&&norm(line?.description)===desc)
        ||sourceLines.find(line=>String(line?.lineNo??line?.line??"")===String(invLine?.lineNo??invLine?.line??""));
    };

    const sourceDiscrepancies=[];
    const mergedLines=invoiceLines.map((invLine,lineIndex)=>{
      const mergedLine={...invLine};
      for(const source of supportingLineSets){
        const supportingLine=findMatch(invLine,source.lines);
        if(!supportingLine)continue;
        Object.keys(supportingLine).forEach(key=>{
          if(key==="lineNo"||key==="line"||isMissing(supportingLine[key]))return;
          if(isMissing(mergedLine[key])){
            mergedLine[key]=supportingLine[key];
          }else if(String(mergedLine[key])!==String(supportingLine[key])){
            sourceDiscrepancies.push({
              lineIndex,
              field:key,
              primaryValue:mergedLine[key],
              supportingValue:supportingLine[key],
              supportingDocumentId:source.doc.id,
              supportingDocument:source.doc.filename
            });
          }
        });
      }
      return mergedLine;
    });

    // If only document-level totals are available, derive line weights using
    // the established apportionment rule rather than treating the lines as missing.
    // Prefer line value as the allocation basis; fall back to quantity, then equal split.
    const toNumber=value=>{
      const n=Number(String(value??"").replace(/,/g,"").trim());
      return Number.isFinite(n)?n:null;
    };
    const totalNetForApportion=toNumber(merged.totalNetWeight);
    const totalGrossForApportion=toNumber(merged.totalGrossWeight);
    const allNetMissing=mergedLines.length>0&&mergedLines.every(line=>isMissing(line.netMassKg)&&isMissing(line.netWeight)&&isMissing(line.netMass));
    const allGrossMissing=mergedLines.length>0&&mergedLines.every(line=>isMissing(line.grossMassKg)&&isMissing(line.grossWeight)&&isMissing(line.grossMass));
    const allocationBasis=mergedLines.map(line=>toNumber(line.totalValue??line.lineValue??line.unitValue));
    const quantityBasis=mergedLines.map(line=>toNumber(line.quantity));
    const basis=allocationBasis.every(v=>v!==null&&v>=0)&&allocationBasis.some(v=>v>0)
      ? allocationBasis
      : quantityBasis.every(v=>v!==null&&v>=0)&&quantityBasis.some(v=>v>0)
        ? quantityBasis
        : mergedLines.map(()=>1);
    const basisTotal=basis.reduce((sum,v)=>sum+(v||0),0);

    const weightApportionmentApproved = pack?.extractedData?.weightApportionmentDecision?.status==="approved" || getCustomerStrategy(pack?.customer).autoApplyWeightApportionment===true;
    if(weightApportionmentApproved && ((allNetMissing&&totalNetForApportion!==null&&basisTotal>0)||(allGrossMissing&&totalGrossForApportion!==null&&basisTotal>0))){
      const apportioned=mergedLines.map(line=>({...line}));

      // Net weight is allocated from the document total using line value
      // (or quantity/equal split fallback).
      if(allNetMissing&&totalNetForApportion!==null){
        apportioned.forEach((line,index)=>{
          const share=(basis[index]||0)/basisTotal;
          line.netMassKg=Math.round(totalNetForApportion*share*1000)/1000;
          line._weightApportionment="Derived from document-level total using line-value allocation";
        });
        const roundedBeforeLast=apportioned.slice(0,-1).reduce((sum,line)=>sum+toNumber(line.netMassKg),0);
        apportioned[apportioned.length-1].netMassKg=Math.round((totalNetForApportion-roundedBeforeLast)*1000)/1000;
      }

      // Gross weight follows the established rule: allocate by the derived
      // net-weight ratio, rather than independently using line value.
      if(allGrossMissing&&totalGrossForApportion!==null){
        const netBasis=apportioned.map(line=>toNumber(line.netMassKg));
        const netBasisTotal=netBasis.every(v=>v!==null&&v>=0)&&netBasis.some(v=>v>0)
          ? netBasis.reduce((sum,v)=>sum+(v||0),0)
          : basisTotal;
        apportioned.forEach((line,index)=>{
          const share=netBasisTotal>0
            ? (netBasis[index]||0)/netBasisTotal
            : (basis[index]||0)/basisTotal;
          line.grossMassKg=Math.round(totalGrossForApportion*share*1000)/1000;
          line._weightApportionment=line._weightApportionment||"Derived from document-level total using line-value allocation";
        });
        const roundedBeforeLast=apportioned.slice(0,-1).reduce((sum,line)=>sum+toNumber(line.grossMassKg),0);
        apportioned[apportioned.length-1].grossMassKg=Math.round((totalGrossForApportion-roundedBeforeLast)*1000)/1000;
      }

      mergedLines.splice(0,mergedLines.length,...apportioned);
    }

    merged.lines=mergedLines;
    merged.workingRecordSource="primary invoice + supporting documents";
    merged.sourceDiscrepancies=sourceDiscrepancies;
    return merged;
  };
  const buildValidatedPack=(pack)=>{
    if(!pack)return pack;
    const data=buildWorkingCustomsRecord(pack);
    const standard=validateStandardCustomsRecord(data);
    const checks=standard.checks;
    const hasFail=checks.some(x=>x.status==="fail");
    const hasReview=checks.some(x=>x.status==="review");
    return {...pack,workingRecord:data,status:(hasFail||hasReview)?"Needs review":"Ready",validationStatus:(hasFail||hasReview)?"Failed":"Validated",validationChecks:checks,validationSummary:standard.summary};
  };
  const persistValidatedPack=async(pack,showToast=false)=>{
    if(!pack)return pack;
    const validated=buildValidatedPack(pack);
    setSelectedPack(validated);
    setLivePacks(prev=>prev.map(p=>p.id===validated.id?validated:p));
    await persistPack(validated);
    if(showToast){
      const failed=validated.validationChecks.filter(x=>x.status==="fail");
      const review=validated.validationChecks.filter(x=>x.status==="review");
      notify(failed.length?"Validation failed — "+failed.map(x=>x.check).slice(0,4).join(", "):review.length?"Validation requires review — "+review.map(x=>x.check).slice(0,4).join(", "):"Data validation complete — all standard checks passed");
    }
    return validated;
  };
  const validatePack=()=>{if(!selectedPack)return;persistValidatedPack(selectedPack,true);};
const postToLCA=()=>{
  if(!selectedPack)return;
  if(selectedPack.validationStatus!=="Validated" || selectedPack.status!=="Ready"){
    notify("Validate the extracted data before posting to LCA");
    return;
  }
  const now=new Date().toISOString();
  const assignedTo=selectedPack.assignedTo&&selectedPack.assignedTo!=="Unassigned"?selectedPack.assignedTo:currentUserName;
  const posted={...selectedPack,status:"Posted to LCA",assignedTo,processingCompletedAt:selectedPack.processingCompletedAt||now,postedToLCAAt:now};
  setSelectedPack(posted);
  setLivePacks(prev=>prev.map(p=>p.id===posted.id?posted:p));
  persistPack(posted);
  notify("Pack posted to LCA");
  navigate("inbox");
};

  if(passwordSetup)return <SupabasePasswordSetup onComplete={user=>{setPasswordSetup(false);setCurrentUser(user);setAuthenticated(true);setPage("inbox");}}/>;
  if(authenticated===null)return <div className="test-login"><div className="test-login-card"><div className="test-login-brand"><div className="brand-mark"><Zap size={18}/></div><div><strong>Customs IDP</strong><span>Intelligent Data Processing</span></div></div><div className="test-login-copy"><div className="eyebrow">Secure access</div><h1>Checking access…</h1><p>Please wait.</p></div></div></div>;
  if(!authenticated)return passwordSetup ? <SupabasePasswordSetup onComplete={user=>{setPasswordSetup(false);setCurrentUser(user);setAuthenticated(true);setPage("inbox");}}/> : <SupabaseLogin onSuccess={user=>{setCurrentUser(user);setAuthenticated(true);setPage("inbox");}}/>;
  if(!currentUser)return <div className="test-login"><div className="test-login-card"><div className="test-login-copy"><div className="eyebrow">Account</div><h1>Loading profile…</h1><p>Loading your Customs IDP organisation access.</p></div></div></div>;

  return <div className={"app-shell "+(sidebarCollapsed?"sidebar-collapsed":"")}>
    <aside className="sidebar">
      <div className="sidebar-head"><div className="brand"><div className="brand-mark"><Zap size={18}/></div><div><strong>Customs IDP</strong><span>Intelligent Data Processing</span></div></div><button className="sidebar-collapse-btn" aria-label={sidebarCollapsed?"Expand navigation":"Collapse navigation"} title={sidebarCollapsed?"Expand navigation":"Collapse navigation"} onClick={()=>setSidebarCollapsed(v=>!v)}>{sidebarCollapsed?<ChevronRight size={16}/>:<ChevronLeft size={16}/>}</button></div>
      <div className="workspace"><div className="avatar">{currentUserInitials}</div><div><b>{currentUserName}</b><span>{currentUserRole==="manager"?"Manager":"Data Processor"} · {dataSource==="database"?"Database connected":"Prototype storage"}</span><small className="workspace-organisation">{DEFAULT_ORGANISATION.name}</small></div></div>
      <nav>
        <NavItem icon={Inbox} label="Inbox" badge={livePacks.length} active={page==="inbox"} onClick={()=>navigate("inbox")}/>
        {canViewManager && <NavItem icon={Activity} label="Manager" active={page==="manager"} onClick={()=>navigate("manager")}/>}
        <NavItem icon={Users} label="Customers" active={page==="customers"} onClick={()=>navigate("customers")}/>
        <NavItem icon={Bot} label="AI Agent" active={page==="agent"} onClick={()=>navigate("agent")}/>
      </nav>
      <div className="side-bottom">
        <NavItem icon={Settings} label="Settings" active={page==="settings"} onClick={()=>navigate("settings")}/>
        <button className="switch-user-btn" onClick={async()=>{await supabase.auth.signOut().catch(()=>{});await fetch("/api/auth",{method:"DELETE",credentials:"include"}).catch(()=>{});setCurrentUser(null);setAuthenticated(false);setPage("inbox")}}><Users size={16}/><span>Sign out</span></button>
        <div className="system-status"><span className="dot"></span><div><b>All systems operational</b><span>Last sync 16:02</span></div></div>
      </div>
    </aside>

    {mobileMenuOpen && <div className="mobile-menu-overlay" onClick={()=>setMobileMenuOpen(false)}><aside className="mobile-menu" onClick={e=>e.stopPropagation()}><div className="mobile-menu-head"><div className="brand"><div className="brand-mark"><Zap size={18}/></div><div><strong>Customs IDP</strong><span>Intelligent Data Processing</span></div></div><button className="icon-btn" aria-label="Close navigation" onClick={()=>setMobileMenuOpen(false)}><X size={20}/></button></div><div className="mobile-workspace"><div className="avatar">{currentUserInitials}</div><div><b>{currentUserName}</b><span>{currentUserRole==="manager"?"Manager":"Data Processor"} · {dataSource==="database"?"Database connected":"Prototype storage"}</span></div></div><nav><NavItem icon={Inbox} label="Inbox" badge={livePacks.length} active={page==="inbox"} onClick={()=>navigate("inbox")}/>{canViewManager && <NavItem icon={Activity} label="Manager" active={page==="manager"} onClick={()=>navigate("manager")}/>}<NavItem icon={Users} label="Customers" active={page==="customers"} onClick={()=>navigate("customers")}/><NavItem icon={Bot} label="AI Agent" active={page==="agent"} onClick={()=>navigate("agent")}/><NavItem icon={Settings} label="Settings" active={page==="settings"} onClick={()=>navigate("settings")}/></nav><button className="switch-user-btn mobile-switch-user" onClick={()=>{setCurrentUser(null);try{localStorage.removeItem("customs-idp-user");}catch{};setPage("inbox")}}><Users size={16}/><span>Switch user</span></button><div className="mobile-system-status"><span className="dot"></span><div><b>All systems operational</b><span>Last sync 16:02</span></div></div></aside></div>}

    <main className={"main "+(page==="review"?"review-mode":"")}>
      <header className="topbar">
        {page==="review" && <button className="back-to-inbox-btn" aria-label="Back to inbox" title="Back to inbox" onClick={()=>navigate("inbox")}><ChevronLeft size={16}/><span>Back to inbox</span></button>}
        <button className="mobile-menu-btn" aria-label="Open navigation" onClick={()=>setMobileMenuOpen(true)}><Menu size={20}/></button><div className="mobile-brand"><strong>Customs IDP</strong></div>
        <div className="crumb"><span className="organisation-crumb">{DEFAULT_ORGANISATION.name}</span> <span>/</span> Operations <span>/</span> {page[0].toUpperCase()+page.slice(1)}</div>
        <div className="top-actions"><button className="icon-btn" aria-label="Open inbox" onClick={()=>navigate("inbox")}><Mail size={18}/></button><div className="top-avatar" title={currentUserName}>{currentUserInitials}</div></div>
      </header>

      <input ref={uploadRef} className="hidden-upload" type="file" multiple accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.png,.jpg,.jpeg,.eml,.msg" onChange={e=>handleUpload(e.target.files)}/>
      <div className="content">
        {page==="manager" && canViewManager && <ManagerPage livePacks={livePacks} dataSource={dataSource}/>} 
        {page==="dashboard" && <Dashboard navigate={navigate} notify={notify} livePacks={livePacks}/>}
        {page==="inbox" && <InboxPage packs={filteredPacks} query={query} setQuery={setQuery} openPack={(p)=>{setSelectedPack(p);navigate("review")}} onUpload={handleUpload} onAssign={assignPack} emailSyncStatus={emailSyncStatus}/>}
        
        {page==="review" && <Review pack={selectedPack} back={()=>navigate("inbox")} notify={notify} onAssign={assignPack} updatePack={updatePack} validatePack={validatePack} postToLCA={postToLCA} reprocessPack={reprocessPack} persistValidatedPack={persistValidatedPack}/>}
        {page==="customers" && <Customers notify={notify}/>}
        {page==="agent" && <AgentPage/>}
        {page==="settings" && <SettingsPage/>}
      </div>
    </main>

    {agentOpen && page!=="agent" && page!=="review" && <button className="agent-fab" onClick={()=>navigate("agent")}><Sparkles size={18}/> AI Agent</button>}
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
  </div>
}

function NavItem({icon:Icon,label,badge,active,onClick}){return <button className={"nav-item "+(active?"active":"")} onClick={onClick}><Icon size={18}/><span>{label}</span>{badge&&<em>{badge}</em>}</button>}

function Dashboard({navigate,notify,livePacks}){
 const totalPacks=livePacks.length;
 const totalDocuments=livePacks.reduce((n,p)=>n+(Number(p.docs)||0),0);
 const validated=livePacks.filter(p=>p.status==="Validated").length;
 const processing=livePacks.filter(p=>p.status==="Processing").length;
 const review=livePacks.filter(p=>p.status==="Needs review").length;
 const avgConfidence=totalPacks?Math.round(livePacks.reduce((n,p)=>n+(Number(p.confidence)||0),0)/totalPacks):0;
 const validationRate=totalPacks?((validated/totalPacks)*100).toFixed(1):"0.0";
 const recent=livePacks.slice(0,6);
 return <section>
  <div className="page-head"><div><div className="eyebrow">Live operation · {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div><h1>{new Date().getHours()<12?"Good morning":new Date().getHours()<18?"Good afternoon":"Good evening"}, Liam</h1><p>Live metrics from the packs currently loaded into Customs IDP.</p></div><button className="primary" onClick={()=>navigate("inbox")}><Inbox size={17}/> Open inbox</button></div>
  <div className="metric-grid">
    <Metric label="Live packs" value={totalPacks.toLocaleString()} delta="Current inbox" icon={Package}/>
    <Metric label="Documents in packs" value={totalDocuments.toLocaleString()} delta="Current inbox" icon={FileText}/>
    <Metric label="Auto-validated" value={validationRate+"%"} delta={validated+" validated"} icon={ShieldCheck}/>
    <Metric label="Needs review" value={review.toLocaleString()} delta={processing+" processing"} icon={AlertCircle} warning={review>0}/>
  </div>
  <div className="dashboard-grid">
    <div className="panel"><div className="panel-head"><div><h2>Live processing queue</h2><p>Current status of every pack in the inbox</p></div><button className="text-btn" onClick={()=>navigate("inbox")}>Open inbox <ArrowRight size={15}/></button></div><div className="queue-list"><Queue label="Validated" value={validated} pct={validationRate} cls="good"/><Queue label="Processing" value={processing} pct={totalPacks?((processing/totalPacks)*100).toFixed(1):"0.0"} cls="blue"/><Queue label="Needs review" value={review} pct={totalPacks?((review/totalPacks)*100).toFixed(1):"0.0"} cls="warn"/></div></div>
    <div className="panel"><div className="panel-head"><div><h2>Extraction health</h2><p>Based on live packs currently loaded</p></div></div><div className="queue-list"><Queue label="Average confidence" value={avgConfidence+"%"} pct={avgConfidence} cls="good"/><Queue label="Documents" value={totalDocuments} pct={100} cls="blue"/><Queue label="Packs requiring attention" value={review} pct={totalPacks?((review/totalPacks)*100).toFixed(1):"0.0"} cls="warn"/></div><button className="text-btn" onClick={()=>navigate("agent")}>Open AI Agent <ArrowRight size={15}/></button></div>
  </div>
  <div className="panel recent"><div className="panel-head"><div><h2>Recent live packs</h2><p>Latest packs currently in the operation</p></div><button className="text-btn" onClick={()=>navigate("inbox")}>View inbox <ArrowRight size={15}/></button></div><PackTable packs={recent} onOpen={(p)=>{navigate("inbox")}}/></div>
 </section>
}

function ManagerPage({livePacks,dataSource}){
 const [period,setPeriod]=useState("7d");
 const [customFrom,setCustomFrom]=useState("");
 const [customTo,setCustomTo]=useState("");
 const [appliedFrom,setAppliedFrom]=useState("");
 const [appliedTo,setAppliedTo]=useState("");
 const now=new Date();
 const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 let rangeStart=null,rangeEnd=null;
 if(period==="today"){rangeStart=today;rangeEnd=new Date(today.getTime()+86400000-1);}
 if(period==="yesterday"){rangeStart=new Date(today.getTime()-86400000);rangeEnd=new Date(today.getTime()-1);}
 if(period==="7d"){rangeStart=new Date(today.getTime()-6*86400000);rangeEnd=new Date(today.getTime()+86400000-1);}
 if(period==="30d"){rangeStart=new Date(today.getTime()-29*86400000);rangeEnd=new Date(today.getTime()+86400000-1);}
 if(period==="thisMonth"){rangeStart=new Date(today.getFullYear(),today.getMonth(),1);rangeEnd=new Date(today.getTime()+86400000-1);}
 if(period==="lastMonth"){rangeStart=new Date(today.getFullYear(),today.getMonth()-1,1);rangeEnd=new Date(today.getFullYear(),today.getMonth(),1)-1;rangeEnd=new Date(rangeEnd);}
 if(period==="thisWeek"){const day=today.getDay()||7;rangeStart=new Date(today.getTime()-(day-1)*86400000);rangeEnd=new Date(today.getTime()+86400000-1);}
 if(period==="lastWeek"){const day=today.getDay()||7;rangeStart=new Date(today.getTime()-(day+6)*86400000);rangeEnd=new Date(today.getTime()-(day-1)*86400000-1);}
 if(period==="custom" && appliedFrom){rangeStart=new Date(appliedFrom+"T00:00:00");rangeEnd=appliedTo?new Date(appliedTo+"T23:59:59.999"):new Date(appliedFrom+"T23:59:59.999");}
 const filtered=livePacks.filter(p=>{
   if(!rangeStart)return true;
   const received=new Date(p.received);
   return !Number.isNaN(received.getTime()) && received>=rangeStart && received<=rangeEnd;
 });
 const totalPacks=filtered.length;
 const totalDocuments=filtered.reduce((n,p)=>n+(Number(p.docs)||0),0);
 const validated=filtered.filter(p=>p.status==="Ready"||p.status==="Validated"||p.status==="Posted to LCA").length;
 const review=filtered.filter(p=>p.status==="Needs review").length;
 const processing=filtered.filter(p=>p.status==="Processing").length;
 const failed=filtered.filter(p=>p.status==="Failed"||p.status==="failed").length;
 const avgConfidence=totalPacks?Math.round(filtered.reduce((n,p)=>n+(Number(p.confidence)||0),0)/totalPacks):0;
 const validationRate=totalPacks?((validated/totalPacks)*100).toFixed(1):"0.0";
 const reviewRate=totalPacks?((review/totalPacks)*100).toFixed(1):"0.0";
 const failureRate=totalPacks?((failed/totalPacks)*100).toFixed(1):"0.0";
 const periodLabel={today:"Today",yesterday:"Yesterday","7d":"Last 7 days","30d":"Last 30 days",thisWeek:"This week",lastWeek:"Last week",thisMonth:"This month",lastMonth:"Last month",all:"All time",custom:"Custom range"}[period];
 const formatDuration=(ms)=>{if(!Number.isFinite(ms)||ms<0)return "—";const mins=Math.round(ms/60000);if(mins<60)return mins+" min";const h=Math.floor(mins/60);const m=mins%60;return h+"h "+String(m).padStart(2,"0")+"m"};
 const team=["Liam Wingrove","Data Processor 1","Data Processor 2","Muhammad Amer"].map(name=>{
   const rows=filtered.filter(p=>p.assignedTo===name);
   const docs=rows.reduce((n,p)=>n+(Number(p.docs)||0),0);
   const reviews=rows.filter(p=>p.status==="Needs review").length;
   const validatedBy=rows.filter(p=>p.status==="Ready"||p.status==="Validated"||p.status==="Posted to LCA").length;
   const timed=rows.filter(p=>p.processingStartedAt&&p.processingCompletedAt).map(p=>new Date(p.processingCompletedAt).getTime()-new Date(p.processingStartedAt).getTime()).filter(ms=>Number.isFinite(ms)&&ms>=0);
   const avgProcessingTime=timed.length?formatDuration(timed.reduce((a,b)=>a+b,0)/timed.length):"—";
   const confidence=rows.length?Math.round(rows.reduce((n,p)=>n+(Number(p.confidence)||0),0)/rows.length)+"%":"—";
   return {name,role:name==="Liam Wingrove"||name==="Muhammad Amer"?"Manager":"Data Processor",packs:rows.length,docs,reviews,validated:validatedBy,confidence,avgProcessingTime};
  });
 const unassigned=filtered.filter(p=>!p.assignedTo||p.assignedTo==="Unassigned").length;
 const customersLive=[...new Set(filtered.map(p=>p.customer).filter(Boolean))];
 return <section>
  <div className="page-head">
   <div><div className="eyebrow">Management · operational intelligence</div><h1>Manager</h1><p>Live operational metrics from the central pack database.</p></div>
   <div className="manager-head-actions">
    <span className="online-pill"><span></span>{dataSource==="database"?"Database connected":"Prototype storage"}</span>
    <select className="manager-period-select" value={period} onChange={e=>setPeriod(e.target.value)}>
     <option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="thisWeek">This week</option><option value="lastWeek">Last week</option><option value="thisMonth">This month</option><option value="lastMonth">Last month</option><option value="all">All time</option><option value="custom">Custom range</option>
    </select>
    {period==="custom" && <div className="manager-custom-range"><label>From<input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/></label><label>To<input type="date" value={customTo} min={customFrom||undefined} onChange={e=>setCustomTo(e.target.value)}/></label><button type="button" className="manager-apply-range" disabled={!customFrom} onClick={()=>{setAppliedFrom(customFrom);setAppliedTo(customTo||customFrom);}}>Apply</button></div>}
   </div>
  </div>
  <div className="metric-grid">
   <Metric label="Packs processed" value={totalPacks.toLocaleString()} delta={validated+" validated"} icon={Package}/>
   <Metric label="Documents processed" value={totalDocuments.toLocaleString()} delta={periodLabel} icon={FileText}/>
   <Metric label="Average AI confidence" value={avgConfidence+"%"} delta={totalPacks?periodLabel:"No packs in period"} icon={Sparkles}/>
   <Metric label="Human review queue" value={review.toLocaleString()} delta={processing+" still processing"} icon={AlertCircle} warning={review>0}/>
  </div>
  <div className="manager-kpi-grid">
   <div className="panel mini-kpi"><span>Auto-validation rate</span><strong>{validationRate}%</strong><small>{validated} of {totalPacks} packs validated</small></div>
   <div className="panel mini-kpi"><span>Human review rate</span><strong>{reviewRate}%</strong><small>{review} packs require review</small></div>
   <div className="panel mini-kpi"><span>Failure rate</span><strong>{failureRate}%</strong><small>{failed} failed packs</small></div>
   <div className="panel mini-kpi"><span>Documents / pack</span><strong>{totalPacks?(totalDocuments/totalPacks).toFixed(1):"0.0"}</strong><small>Average in selected period</small></div>
  </div>
  <div className="manager-grid">
   <div className="panel">
    <div className="panel-head"><div><h2>Team performance</h2><p>{periodLabel} · based on pack ownership</p></div></div>
    <div className="manager-table-wrap"><table><thead><tr><th>TEAM MEMBER</th><th>ROLE</th><th>PACKS</th><th>DOCUMENTS</th><th>VALIDATED</th><th>REVIEWS</th><th>AVG CONF.</th><th>AVG PROCESSING</th></tr></thead><tbody>{team.map(m=><tr key={m.name}><td><b>{m.name}</b></td><td>{m.role}</td><td>{m.packs}</td><td>{m.docs}</td><td>{m.validated}</td><td>{m.reviews}</td><td>{m.confidence}</td><td>{m.avgProcessingTime}</td></tr>)}</tbody></table></div>
    <div className="manager-note"><ShieldCheck size={15}/><span>{unassigned?unassigned+" pack"+(unassigned===1?" is":"s are")+" currently unassigned in this period.":"All packs in this period have an owner."} Assign ownership from Inbox to populate team performance.</span></div>
   </div>
   <div className="panel"><div className="panel-head"><div><h2>Platform health</h2><p>{periodLabel} workload across the operation</p></div></div><div className="queue-list"><Queue label="Validated" value={validated} pct={totalPacks?((validated/totalPacks)*100).toFixed(1):"0.0"} cls="good"/><Queue label="Processing" value={processing} pct={totalPacks?((processing/totalPacks)*100).toFixed(1):"0.0"} cls="blue"/><Queue label="Needs review" value={review} pct={totalPacks?((review/totalPacks)*100).toFixed(1):"0.0"} cls="warn"/></div></div>
  </div>
  <div className="panel manager-section">
   <div className="panel-head"><div><h2>Customer workload</h2><p>{periodLabel} customer activity</p></div></div>
   <div className="manager-customer-grid">
    {customersLive.length?customersLive.map(name=>{
      const rows=filtered.filter(p=>p.customer===name);
      const docs=rows.reduce((n,p)=>n+(Number(p.docs)||0),0);
      const needs=rows.filter(p=>p.status==="Needs review").length;
      const avg=rows.length?Math.round(rows.reduce((n,p)=>n+(Number(p.confidence)||0),0)/rows.length):0;
      return <div className="manager-customer" key={name}><b>{name}</b><span>{rows.length} packs · {docs} documents</span><small>{needs} requiring review · {avg}% avg confidence</small></div>;
    }):<div className="manager-empty">No customer activity is recorded for {periodLabel.toLowerCase()}.</div>}
   </div>
  </div>
  <div className="manager-section-head"><div><h2>Management controls</h2><p>Operational controls connected to the central database.</p></div></div>
  <div className="manager-control-grid">
   <div className="panel manager-control"><Activity size={18}/><div><b>Processing analytics</b><span>{totalPacks} packs and {totalDocuments} documents in {periodLabel.toLowerCase()}.</span></div></div>
   <div className="panel manager-control"><Users size={18}/><div><b>Team allocation</b><span>Assign pack ownership from the Inbox owner column.</span></div></div>
   <div className="panel manager-control"><ShieldCheck size={18}/><div><b>Quality & intervention</b><span>{review} packs currently require human review.</span></div></div>
   <div className="panel manager-control"><FileText size={18}/><div><b>Processing time</b><span>Timing fields will populate once start/completion timestamps are recorded.</span></div></div>
  </div>
 </section>;
}
function Metric({label,value,delta,icon:Icon,warning}){return <div className="metric"><div className={"metric-icon "+(warning?"warning":"")}><Icon size={19}/></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small className={delta.startsWith("-")?"positive":""}>{delta}</small></div></div>}
function Queue({label,value,pct,cls}){return <div className="queue"><div><span className={"queue-dot "+cls}></span><b>{label}</b><strong>{value}</strong></div><div className="progress"><i className={cls} style={{width:pct+"%"}}></i></div><small>{pct}%</small></div>}

function InboxPage({packs,query,setQuery,openPack,title="Inbox",onUpload,onAssign,emailSyncStatus,packLoadError}){
 return <section><div className="page-head"><div><div className="eyebrow">Document processing</div><h1>{title}</h1><p>Review incoming document packs, extraction confidence and validation status.</p></div><button className="primary" onClick={()=>document.querySelector(".hidden-upload")?.click()}><Plus size={17}/> Upload documents</button></div>
 <div className={"email-sync-debug "+(emailSyncStatus?.state==="error"?"error":"")}><strong>Outlook intake</strong><span>{emailSyncStatus?.state==="error" ? ("Sync error: "+emailSyncStatus.error) : emailSyncStatus?.state==="success" ? (emailSyncStatus.checked+" matching · "+emailSyncStatus.processed+" processed · "+emailSyncStatus.duplicates+" duplicate · "+emailSyncStatus.failed+" failed"+(emailSyncStatus.failures&&emailSyncStatus.failures.length?" · "+emailSyncStatus.failures[0]:"")) : "Checking Outlook…"}</span></div>
 {packLoadError&&<div className="email-sync-debug error"><strong>Inbox database</strong><span>{packLoadError}</span></div>}
 <div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search packs, customers or tickets..."/></div><button className="filter">Status <ChevronDown size={15}/></button><button className="filter">Customer <ChevronDown size={15}/></button></div>
 <div className="panel"><PackTable packs={packs} onOpen={openPack} onAssign={onAssign}/></div></section>
}

function formatReceivedDateTime(value){
  if(!value)return "—";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return value;
  const pad=n=>String(n).padStart(2,"0");
  return `${pad(date.getDate())}/${pad(date.getMonth()+1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getPackCustomerLabel(pack){
  if(pack?.customer && pack.customer!=="Unassigned customer") return pack.customer;
  const data=pack?.workingRecord||pack?.extractedData||{};
  const exporter=data?.exporter||data?.exporterName||data?.exporterCompany||data?.exporterCompanyName;
  if(exporter) return String(exporter);
  const primary=Array.isArray(data?.documents)?data.documents.find(d=>d?.extraction?.exporter)||data.documents[0]:null;
  const documentExporter=primary?.extraction?.exporter||primary?.extraction?.exporterName||primary?.extraction?.exporterCompany||primary?.extraction?.exporterCompanyName;
  return documentExporter ? String(documentExporter) : "Unassigned customer";
}
function PackTable({packs,onOpen,onAssign}){return <div className="table-wrap"><table><thead><tr><th>PACK</th><th>CUSTOMER</th><th>OWNER</th><th>DOCUMENTS</th><th>STATUS</th><th>CONFIDENCE</th><th>RECEIVED</th><th></th></tr></thead><tbody>{packs.map(p=>{const displayLabel=p.email?.subject||p.uploadedFiles?.[0]?.name||p.id;return <tr key={p.id} onClick={()=>onOpen(p)}><td><b>{displayLabel}</b></td><td>{getPackCustomerLabel(p)}</td><td><select className="owner-select" value={p.assignedTo||"Unassigned"} onClick={e=>e.stopPropagation()} onChange={e=>onAssign?.(p.id,e.target.value)}><option>Unassigned</option><option>Liam Wingrove</option><option>Data Processor 1</option><option>Data Processor 2</option><option>Muhammad Amer</option></select></td><td>{p.docs} documents</td><td><Status status={p.status}/></td><td><div className="confidence"><span>{p.confidence}%</span><div><i style={{width:p.confidence+"%"}}></i></div></div></td><td>{formatReceivedDateTime(p.received)}</td><td><button className="row-btn"><MoreHorizontal size={17}/></button></td></tr>})}</tbody></table></div>}
function Status({status}){let c=status==="Validated"?"good":status==="Processing"?"processing":"review";return <span className={"status "+c}><span></span>{status}</span>}

function reconcilePackDocuments(pack){
  const docs=Array.isArray(pack?.extractedData?.documents)?pack.extractedData.documents:[];
  if(docs.length<2) return {status:"not_ready",summary:"At least two extracted documents are required.",checks:[],conflicts:[]};
  const norm=v=>String(v??"").trim().toLowerCase().replace(/\\s+/g," ");
  const checks=[]; const conflicts=[];
  const compare=(label,key)=>{
    const found=docs.map(d=>({name:d.filename,value:d.extraction?.[key]})).filter(x=>x.value!=null&&x.value!=="");
    const unique=[...new Set(found.map(x=>norm(x.value)))];
    if(found.length<2){checks.push({label,status:"not_applicable",detail:"Not enough documents contain this field."});return;}
    if(unique.length===1) checks.push({label,status:"pass",detail:found.map(x=>x.name+": "+x.value).join(" · ")});
    else {checks.push({label,status:"conflict",detail:found.map(x=>x.name+": "+x.value).join(" · ")});conflicts.push({label,values:found});}
  };
  compare("Invoice number","invoiceNumber"); compare("Country of export","countryOfExport"); compare("Destination","sourceCountryOfDestination");
  compare("Total packages","totalPackages"); compare("Total net weight","totalNetWeight"); compare("Total gross weight","totalGrossWeight"); compare("Currency","currency");
  const lineCounts=docs.map(d=>({name:d.filename,count:Array.isArray(d.extraction?.lines)?d.extraction.lines.length:0})).filter(x=>x.count>0);
  if(lineCounts.length>=2){const unique=[...new Set(lineCounts.map(x=>x.count))]; if(unique.length===1) checks.push({label:"Goods line count",status:"pass",detail:lineCounts.map(x=>x.name+": "+x.count).join(" · ")}); else {checks.push({label:"Goods line count",status:"conflict",detail:lineCounts.map(x=>x.name+": "+x.count).join(" · ")});conflicts.push({label:"Goods line count",values:lineCounts});}}
  return {status:conflicts.length?"conflict":"pass",summary:conflicts.length?(conflicts.length+" cross-document conflict"+(conflicts.length===1?"":"s")+" found."):"Extracted document values reconcile with no conflicts detected.",checks,conflicts,documentCount:docs.length};
}

function SpreadsheetPreview({url}){
  const officeUrl="https://view.officeapps.live.com/op/view.aspx?src="+encodeURIComponent(url);
  return <div className="spreadsheet-preview-office">
    <iframe src={officeUrl} title="Excel document preview" />
  </div>;
}
function Review({pack,currentUserName,back,notify,onAssign,updatePack,validatePack,postToLCA,reprocessPack,persistValidatedPack}){
 const [docUrls,setDocUrls]=useState({});
 const [chat,setChat]=useState("");
 const [messages,setMessages]=useState([]);
 const [isSending,setIsSending]=useState(false);
 const chatHistoryRef=useRef(null);
 const [selectedDocumentId,setSelectedDocumentId]=useState(null);
 const [previewPage,setPreviewPage]=useState(1);
 const [showPreview,setShowPreview]=useState(false);
 useEffect(()=>{
   const el=chatHistoryRef.current;
   if(!el)return;
   const frame=requestAnimationFrame(()=>{el.scrollTop=el.scrollHeight;});
   return()=>cancelAnimationFrame(frame);
 },[messages]);
 const [showSummary,setShowSummary]=useState(false);
 const [showEmailSource,setShowEmailSource]=useState(false);

 const [emailDraft,setEmailDraft]=useState(null);
 const emailAuditStartedRef=useRef(null);

 useEffect(()=>{let active=true;(async()=>{const entries=await Promise.all((pack.uploadedFiles||[]).map(async f=>{try{if(f.storagePath){const response=await fetch("/api/storage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"signed-url",path:f.storagePath})});const data=await response.json();if(response.ok&&data.signedUrl)return [f.id,data.signedUrl];}const file=await getUploadedDocument(f.id);return file?[f.id,URL.createObjectURL(file)]:null;}catch{return null;}}));if(active)setDocUrls(Object.fromEntries(entries.filter(Boolean)));})();return()=>{active=false;};},[pack.id,pack.uploadedFiles]);

 const documentRows=pack.uploadedFiles?.length?pack.uploadedFiles:[
   {id:"sample-1",name:"Commercial Invoice 88421.pdf"},{id:"sample-2",name:"Packing List 88421.pdf"},
   {id:"sample-3",name:"Certificate of Origin.pdf"},{id:"sample-4",name:"Transport Document.pdf"}
 ];
 const extractedDocuments=useMemo(()=>{
   const stored=Array.isArray(pack.extractedData?.documents)?pack.extractedData.documents:[];
   if(stored.length)return stored;
   const primary=pack.extractedData&&Object.keys(pack.extractedData).length?pack.extractedData:null;
   if(!primary)return [];
   const fallbackFile=pack.uploadedFiles?.[0];
   if(!fallbackFile)return [];
   return [{
     id:fallbackFile.id||fallbackFile.name,
     filename:fallbackFile.name,
     mimeType:fallbackFile.type||"application/octet-stream",
     extraction:primary
   }];
 },[pack.id,pack.extractedData,pack.uploadedFiles]);
 const evidenceFor=doc=>{const e=doc?.extraction||{};const all=[...(e.fieldEvidence||[])];(e.lines||[]).forEach(line=>(line.evidence||[]).forEach(x=>all.push(x)));return all;};
 const getEvidence=(doc,fields=[])=>{const ev=evidenceFor(doc);return ev.find(x=>fields.includes(x.field)&&x.page)||ev.find(x=>x.page);};
 const getWeightConflicts=()=>{
   const docs=extractedDocuments;
   const invoiceDoc=docs.find(d=>d.extraction?.documentType==="commercial_invoice")||docs[0];
   // The customs summary is the human-facing working record. Start from the original invoice extraction, then overlay all user/agent corrections from the working pack data.
   const workingData={...(pack.workingRecord||pack.extractedData||{})};
   const primaryAliases={exporterEori:"exporterEoriNo",eori:"exporterEoriNo",exporterEORI:"exporterEoriNo",invoiceTotal:"totalInvoiceValue",invoiceValue:"totalInvoiceValue",countryOfExportCode:"countryOfExport",destinationCountry:"sourceCountryOfDestination"};
   Object.entries(primaryAliases).forEach(([from,to])=>{if((workingData[to]===undefined||workingData[to]===null||workingData[to]==="")&&workingData[from]!==undefined&&workingData[from]!==null&&workingData[from]!=="")workingData[to]=workingData[from];});
   const reviewOverrides=Array.isArray(workingData.reviewOverrides)?workingData.reviewOverrides:[];
   reviewOverrides.filter(o=>o?.scope==="primary"&&o?.field).forEach(o=>{if(o.newValue!==undefined)workingData[o.field]=o.newValue;});
   const invoice={...(invoiceDoc?.extraction||{}),...workingData};
   const packingDoc=docs.find(d=>/packing/i.test(d.filename||""))||docs.find(d=>d.extraction?.documentType==="packing_list");
   if(!invoiceDoc||!packingDoc)return [];
   const invoiceLines=Array.isArray(invoice.lines)?invoice.lines:[];
   const sourceLines=Array.isArray(packingDoc.extraction?.lines)?packingDoc.extraction.lines:[];
   const key=line=>String(line?.hsCode||"")+"|"+String(line?.description||"").trim().toLowerCase();
   return invoiceLines.map(inv=>{
     const line=sourceLines.find(x=>key(x)===key(inv))||sourceLines.find(x=>String(x?.description||"").trim().toLowerCase()===String(inv?.description||"").trim().toLowerCase());
     if(!line)return null;
     const netDifferent=inv?.netMassKg!=null&&line?.netMassKg!=null&&String(inv.netMassKg)!==String(line.netMassKg);
     const grossDifferent=inv?.grossMassKg!=null&&line?.grossMassKg!=null&&String(inv.grossMassKg)!==String(line.grossMassKg);
     return netDifferent||grossDifferent?{doc:packingDoc,line,invoice:inv}:null;
   }).filter(Boolean);
 };
 const sourceButton=(label,docId,page)=><button type="button" className="source-reference" onClick={()=>{setSelectedDocumentId(docId);setPreviewPage(Number(page)||1);setShowPreview(true);}}>{label}</button>;

 const buildSummary=()=>{
   const docs=extractedDocuments;
   const invoiceDoc=docs.find(d=>d.extraction?.documentType==="commercial_invoice")||docs[0];
   const workingData={...(pack.workingRecord||pack.extractedData||{})};
   const hasOwn=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
   const primaryOverrides=Array.isArray(workingData.reviewOverrides)?workingData.reviewOverrides.filter(o=>o?.scope==="primary"&&o?.field):[];
   primaryOverrides.forEach(o=>{if(o.newValue!==undefined)workingData[o.field]=o.newValue;});
   const primaryAliases={exporterEori:"exporterEoriNo",eori:"exporterEoriNo",exporterEORI:"exporterEoriNo",invoiceTotal:"totalInvoiceValue",invoiceValue:"totalInvoiceValue"};
   Object.entries(primaryAliases).forEach(([from,to])=>{if(!hasOwn(workingData,to)&&hasOwn(workingData,from))workingData[to]=workingData[from];});
   const invoice={...(invoiceDoc?.extraction||{}),...workingData};
   const value=v=>v===undefined||v===null||v===""?"":String(v);
   const hasValue=v=>v!==undefined&&v!==null&&v!=="";
   if(!docs.length){
     return [{type:"agent",text:pack.processingError?"I couldn't complete the extraction. "+pack.processingError:"I'm waiting for document extraction to finish."}];
   }

   const supportingDocs=docs.filter(d=>d!==invoiceDoc);
   const packingDoc=supportingDocs.find(d=>/packing/i.test(d.filename||""))||supportingDocs[0];
   const sourceFor=doc=>{
     const ev=evidenceFor(doc);
     return ev.find(x=>x.page)?.page||1;
   };
   const lineKey=line=>String(line?.hsCode||"")+"|"+String(line?.description||"").trim().toLowerCase();
   const lines=Array.isArray(pack.workingRecord?.lines)?pack.workingRecord.lines:(Array.isArray(pack.extractedData?.lines)?pack.extractedData.lines:(Array.isArray(invoice.lines)?invoice.lines:[]));
   const findSourceLine=(doc,invLine)=>{
     const sourceLines=Array.isArray(doc?.extraction?.lines)?doc.extraction.lines:[];
     return sourceLines.find(l=>lineKey(l)===lineKey(invLine))||sourceLines.find(l=>String(l.description||"").trim().toLowerCase()===String(invLine.description||"").trim().toLowerCase());
   };

   const weightApportionmentDecision=pack.extractedData?.weightApportionmentDecision?.status||null;
   const customerStrategy=getCustomerStrategy(pack.customer);
   const hasDocumentLevelWeights=hasValue(invoice.totalNetWeight)||hasValue(invoice.totalGrossWeight);
   const hasMissingLineWeights=lines.length>0&&lines.some(line=>!hasValue(line.netMassKg)&&!hasValue(line.netWeight)&&!hasValue(line.netMass));
   const shouldAskWeightApportionment=hasDocumentLevelWeights&&hasMissingLineWeights&&!weightApportionmentDecision&&!customerStrategy.autoApplyWeightApportionment;
   const selectedWeightSource=pack.extractedData?.weightSourceDecision?.source||null;
   const customsLines=lines.map((line,index)=>{
     const plLine=packingDoc?findSourceLine(packingDoc,line):null;
     const workingNet=selectedWeightSource==="packing_list"?plLine?.netMassKg:(line.netMassKg??line.netWeight??line.netMass);
     const workingGross=selectedWeightSource==="packing_list"?plLine?.grossMassKg:(line.grossMassKg??line.grossWeight??line.grossMass);
     return {
       no:index+1,
       description:value(line.description)||"Unnamed goods line",
       hs:String(line.hsCode??"").replace(/[.\s-]/g,""),
       origin:value(line.sourceCountryCode),
       quantity:value(line.quantity),
       net:value(workingNet),
       gross:value(workingGross),
       itemValue:value(line.totalValue)
     };
   });

   const conflicts=[];
   customsLines.forEach((row,index)=>{
     const invLine=lines[index];
     const plLine=packingDoc?findSourceLine(packingDoc,invLine):null;
     if(!plLine)return;
     const netDifferent=hasValue(invLine?.netMassKg)&&hasValue(plLine?.netMassKg)&&String(invLine.netMassKg)!==String(plLine.netMassKg);
     const grossDifferent=hasValue(invLine?.grossMassKg)&&hasValue(plLine?.grossMassKg)&&String(invLine.grossMassKg)!==String(plLine.grossMassKg);
     if(netDifferent||grossDifferent)conflicts.push({doc:packingDoc,line:plLine,invoice:invLine});
   });

   const checks=[
     {label:"Invoice number",status:hasValue(invoice.invoiceNumber)?"pass":"warning",detail:hasValue(invoice.invoiceNumber)?value(invoice.invoiceNumber):"Not extracted"},
     {label:"Exporter",status:hasValue(invoice.exporter)?"pass":"warning",detail:hasValue(invoice.exporter)?value(invoice.exporter):"Not extracted"},
     {label:"Consignee",status:hasValue(invoice.consignee)?"pass":"warning",detail:hasValue(invoice.consignee)?value(invoice.consignee):"Not extracted"},
     {label:"HS codes",status:lines.every(l=>hasValue(l.hsCode))?"pass":"warning",detail:lines.every(l=>hasValue(l.hsCode))?"All goods lines have HS codes.":"One or more goods lines are missing an HS code."},
     {label:"Country of origin",status:lines.every(l=>hasValue(l.sourceCountryCode))?"pass":"warning",detail:lines.every(l=>hasValue(l.sourceCountryCode))?"All goods lines have an origin code.":"One or more goods lines are missing an origin code."},
     {label:"Weight comparison",status:conflicts.length?(pack.extractedData?.weightSourceDecision?"pass":"warning"):"pass",detail:conflicts.length?(pack.extractedData?.weightSourceDecision?"Source selected: "+(pack.extractedData.weightSourceDecision.source==="packing_list"?"Packing List":"Commercial Invoice")+". Working weights have been updated.":"Line-level weight differences found between the invoice and packing list — a source must be selected."):"No line-level weight discrepancies found."}
   ];

   const exportCountry=value(invoice.countryOfExport).trim().toUpperCase();
   const exporterCountryIso=value(invoice.exporterCountryIso).trim().toUpperCase();
   const exporterAddress=value(invoice.exporterAddress);
   const isGBExporter=exportCountry==="GB"||exporterCountryIso==="GB"||/(?:^|[\\n, ])(?:GB|UK|UNITED KINGDOM)(?:$|[\\n, ])/i.test(exporterAddress);
   const agentIssues=[];
   if(isGBExporter&&!hasValue(invoice.exporterEoriNo)){
     agentIssues.push({
       title:"GB exporter EORI missing",
       detail:"The exporter appears to be in Great Britain, but no EORI number was extracted. Check the commercial invoice for the EORI number. If it is present, tell me where it appears or re-process the document.",
       sourceDocumentId:invoiceDoc?.id||null,
       sourcePage:sourceFor(invoiceDoc)
     });
   }
   const missingExporterAddressFields=[
     !hasValue(invoice.exporterAddressLine1)?"Address line 1":null,
     !hasValue(invoice.exporterPostcode)?"Postcode/ZIP":null,
     !hasValue(invoice.exporterCity)?"City":null,
     !hasValue(invoice.exporterCountryIso)?"Country ISO":null
   ].filter(Boolean);
   if(missingExporterAddressFields.length){
     agentIssues.push({
       title:"Exporter address incomplete",
       detail:"Missing structured field(s): "+missingExporterAddressFields.join(", ")+". The full exporter address is still shown below; check the commercial invoice and correct only the missing component(s) before posting to LCA.",
       sourceDocumentId:invoiceDoc?.id||null,
       sourcePage:sourceFor(invoiceDoc)
     });
   }
   if(conflicts.length&&!pack.extractedData?.weightSourceDecision){
     agentIssues.push({
       title:"Weight discrepancy needs a decision",
       detail:"The commercial invoice and packing list contain different weights. Choose the source to use for the customs entry, or email the customer for confirmation.",
       sourceDocumentId:packingDoc?.id||null,
       sourcePage:sourceFor(packingDoc)
     });
   }

   return [
     {type:"agent",text:"I've combined the document pack into one customs-entry summary. The table shows the working customs weights only; the selected source is recorded separately so the declaration is not carrying duplicate PKL/CIV weight columns.",persist:false},
     ...(agentIssues.length?[{
       type:"agentIssues",
       issues:agentIssues,
       persist:false
     }]:[]),
     {
       type:"customsEntrySummary",
       summary:{
         invoice:value(invoice.invoiceNumber),exporter:value(invoice.exporter),consignee:value(invoice.consignee),
         currency:value(invoice.currency),invoiceValue:value(invoice.totalInvoiceValue),exportCountry:value(invoice.countryOfExport),exporterAddress:value(invoice.exporterAddress),exporterAddressLine1:value(invoice.exporterAddressLine1),exporterPostcode:value(invoice.exporterPostcode),exporterCity:value(invoice.exporterCity),exporterCountryIso:value(invoice.exporterCountryIso),exporterEoriNo:value(invoice.exporterEoriNo),consigneeAddress:value(invoice.consigneeAddress),consigneeAddressLine1:value(invoice.consigneeAddressLine1),consigneePostcode:value(invoice.consigneePostcode),consigneeCity:value(invoice.consigneeCity),consigneeCountryIso:value(invoice.consigneeCountryIso),
         destination:value(invoice.sourceCountryOfDestination),packages:value(invoice.totalPackages),
         gross:value(selectedWeightSource==="packing_list"?(packingDoc?.extraction?.totalGrossWeight??invoice.totalGrossWeight):invoice.totalGrossWeight),
         net:value(selectedWeightSource==="packing_list"?(packingDoc?.extraction?.totalNetWeight??invoice.totalNetWeight):invoice.totalNetWeight),
         freightAmount:value(invoice.freightAmount),
         freightCurrency:value(invoice.freightCurrency||invoice.currency),
         freightExchangeRate:value(invoice.freightToInvoiceExchangeRate),
         deliveryTerm:value(invoice.deliveryTerm),lines:customsLines,
         sourceLabel:invoiceDoc?.filename||"Commercial Invoice",sourceDocumentId:invoiceDoc?.id||null,sourcePage:sourceFor(invoiceDoc),weightSourceDecision:pack.extractedData?.weightSourceDecision?.source||null
       },
       persist:false
     },
     {type:"validationSummary",checks:Array.isArray(pack.validationChecks)?pack.validationChecks:validateStandardCustomsRecord(pack.workingRecord||pack.extractedData||{}).checks,persist:false},
     ...(shouldAskWeightApportionment?[{
       type:"weightApportionmentDecision",
       text:"The document contains total weight information, but line-level weights are missing. I can apportion the total net weight across the goods lines using the configured line-value method, then apportion gross weight using the resulting net-weight ratio. Would you like me to apply this for this pack? If this customer strategy is configured to allow automatic apportionment, I will apply it without asking.",
       persist:false
     }]:[]),
     ...(conflicts.length&&!pack.extractedData?.weightSourceDecision?[{
       type:"weightDecision",
       text:"Weight discrepancy detected. The invoice and packing list contain different line-level weights. No value has been silently chosen.",
       conflicts,
       persist:false
     }]:[])
   ];
 };
 useEffect(()=>{
   const saved=Array.isArray(pack.extractedData?.agentMessages)?pack.extractedData.agentMessages:[];
   const weightResolved=Boolean(pack.extractedData?.weightSourceDecision?.source);
   const cleanedSaved=saved.filter(m=>!(weightResolved&&((m.type==="weightDecision")||/weight discrepancy detected/i.test(String(m.text||"")))));
   setMessages([...buildSummary().filter(m=>m.type!=="customsEntrySummary"),...cleanedSaved]);
 },[pack.id,pack.extractedData,pack.workingRecord,pack.validationStatus,pack.validationChecks,extractedDocuments]);
 useEffect(()=>{if(!documentRows.length){setSelectedDocumentId(null);return;}setSelectedDocumentId(current=>documentRows.some(d=>(d.id||d.name)===current)?current:(documentRows[0].id||documentRows[0].name));},[pack.id,pack.uploadedFiles?.length]);
 useEffect(()=>{
   if(!pack?.email||!pack?.extractedData)return;
   if(emailAuditStartedRef.current===pack.id)return;
   const savedMessages=Array.isArray(pack.extractedData?.agentMessages)?pack.extractedData.agentMessages:[];
   if(savedMessages.some(m=>m?.type==="fieldSuggestion"))return;
   emailAuditStartedRef.current=pack.id;
   let active=true;
   (async()=>{
     try{
       const response=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
         message:"[AUTOMATED EMAIL AUDIT] Review the associated email against the extracted document data before the user asks a question. Identify clear customs-relevant information present in the email but missing from the extracted data. Do not change the pack; return suggestions requiring human confirmation.",
         pack:{...pack,customerStrategy:getCustomerStrategy(pack.customer),conversation:[],extractedData:{...(pack.extractedData||{}),agentMessages:undefined}}
       })});
       const result=await response.json();
       if(!active||!response.ok||result.action!=="suggest_field_updates"||!Array.isArray(result.suggestions)||!result.suggestions.length)return;
       const suggestionMessage={type:"fieldSuggestion",text:result.reply||"I found additional customs information in the email that is missing from the document extraction. Review the suggestions below and confirm whether to add them.",suggestions:result.suggestions,handled:null,persist:true};
       setMessages(current=>current.some(m=>m.type==="fieldSuggestion")?current:[...current,suggestionMessage]);
       const data=JSON.parse(JSON.stringify(pack.extractedData||{}));
       data.agentMessages=[...(Array.isArray(data.agentMessages)?data.agentMessages:[]),serialiseMessage(suggestionMessage)];
       updatePack?.({...pack,extractedData:data});
     }catch{}
   })();
   return()=>{active=false;};
 },[pack?.id,pack?.email,pack?.extractedData?.documents]);


 const selectedDocument=documentRows.find(d=>(d.id||d.name)===selectedDocumentId)||documentRows[0];
 const selectedDocumentUrl=selectedDocument?docUrls[selectedDocument.id]:null;
 const selectedDocumentIsPdf=/\.pdf$/i.test(selectedDocument?.name||"");
 const selectedDocumentIsImage=/^image\//i.test(selectedDocument?.type||"")||/\.(png|jpe?g|webp|gif)$/i.test(selectedDocument?.name||"");
 const selectedDocumentIsSpreadsheet=/\.(xlsx|xls|xlsm|xlsb|csv)$/i.test(selectedDocument?.name||"")||/spreadsheet|excel|csv/i.test(selectedDocument?.type||"");
 const selectedDocumentFrameUrl=selectedDocumentUrl&&selectedDocumentIsPdf?selectedDocumentUrl+"#page="+previewPage+"&view=FitH&zoom=page-width":selectedDocumentUrl;

 const applyAgentAction=action=>{
   if(!action||action.kind!=="update_field")return null;
   const target=action.target||{}, data=JSON.parse(JSON.stringify(pack.extractedData||{}));
   if(target.scope==="line"&&Number.isInteger(target.lineIndex)&&data.lines?.[target.lineIndex]){
     const line=data.lines[target.lineIndex];
     const oldValue=line[target.field];
     line[target.field]=target.value;
     data.reviewOverrides=[...(data.reviewOverrides||[]),{scope:"line",lineIndex:target.lineIndex,field:target.field,oldValue,newValue:target.value,sourceDocumentId:target.sourceDocumentId||null,sourcePage:target.sourcePage||null,createdAt:new Date().toISOString()}];
   }else if(target.scope==="primary"&&target.field){
     const oldValue=data[target.field];
     data[target.field]=target.value;
     data.reviewOverrides=[...(data.reviewOverrides||[]),{scope:"primary",field:target.field,oldValue,newValue:target.value,sourceDocumentId:target.sourceDocumentId||null,sourcePage:target.sourcePage||null,createdAt:new Date().toISOString()}];
   }else return null;
   updatePack?.({...pack,extractedData:data,status:"Needs review",validationStatus:undefined,validationChecks:undefined,postedToLCAAt:undefined});
   return "I saved that correction to the pack and cleared the previous validation result. The affected data needs to be validated again.";
 };
 const applySuggestedFields=(suggestions,messageIndex)=>{
   const valid=Array.isArray(suggestions)?suggestions.filter(s=>s&&(s.scope==="line"||s.scope==="primary")&&s.field&&s.value!==""):[],
     data=JSON.parse(JSON.stringify(pack.extractedData||{}));
   let applied=0;
   const now=new Date().toISOString();
   valid.forEach(suggestion=>{
     let existing=null;
     if(suggestion.scope==="line"){
       const line=data.lines?.[suggestion.lineIndex];
       if(!line)return;
       existing=line[suggestion.field];
       if(existing!==undefined&&existing!==null&&String(existing).trim()!=="")return;
       line[suggestion.field]=suggestion.value;
     }else{
       existing=data[suggestion.field];
       if(existing!==undefined&&existing!==null&&String(existing).trim()!=="")return;
       data[suggestion.field]=suggestion.value;
     }
     data.reviewOverrides=[...(data.reviewOverrides||[]),{
       scope:suggestion.scope,
       lineIndex:suggestion.scope==="line"?suggestion.lineIndex:null,
       field:suggestion.field,
       oldValue:existing??null,
       newValue:suggestion.value,
       source:"email",
       sourceLabel:suggestion.sourceLabel||"Email body",
       sourceDocumentId:suggestion.sourceDocumentId||null,
       sourcePage:suggestion.sourcePage||null,
       reason:suggestion.reason||"Value confirmed by the user from the email source.",
       createdAt:now
     }];
     applied++;
   });
   const confirmation={type:"agent",text:"Confirmed. I added "+applied+" email-sourced field"+(applied===1?"":"s")+" to the working customs data. The previous validation result was cleared; run Validate data to check the updated pack.",persist:true};
   const updatedMessages=messages.map((m,index)=>index===messageIndex?{...m,handled:"applied"}:m).concat(confirmation);
   data.agentMessages=updatedMessages.filter(m=>m.persist!==false).map(serialiseMessage);
   const next={...pack,extractedData:data,status:"Needs review",validationStatus:undefined,validationChecks:undefined,postedToLCAAt:undefined};
   updatePack?.(next);
   setMessages(updatedMessages);
   notify?.(applied?"Added "+applied+" email-sourced field"+(applied===1?"":"s")+" to the pack":"No new email-sourced fields were added");
 };
 const ignoreSuggestedFields=(messageIndex)=>{
   setMessages(current=>[...current.map((m,index)=>index===messageIndex?{...m,handled:"ignored"}:m),{type:"agent",text:"Understood. I left the extracted document data unchanged and did not add the email values.",persist:true}]);
 };
 const serialiseMessage=m=>({
   type:m.type||"agent",text:m.text||"",sourceDocumentId:m.sourceDocumentId||null,
   sourcePage:Number.isInteger(m.sourcePage)?m.sourcePage:null,sourceLabel:m.sourceLabel||null,
   suggestions:Array.isArray(m.suggestions)?m.suggestions:null,handled:m.handled||null
 });
 const persistConversation=async conversation=>{
   const data=JSON.parse(JSON.stringify(pack.extractedData||{}));
   data.agentMessages=conversation.filter(m=>m.persist!==false).map(serialiseMessage);
   const nextPack={...pack,extractedData:data};
   const saved=await persistPack?.(nextPack);
   if(!saved) notify?.("Chat history could not be saved to the database");
   return saved;
 };
 const sendChat=async()=>{
   const q=chat.trim();if(!q||isSending)return;
   const userMessage={type:"user",text:q,persist:true};
   const thinking={type:"agent",text:"I'm checking the uploaded documents and their source evidence...",persist:false};
   const conversationBefore=[...messages,userMessage];
   setIsSending(true);setMessages([...conversationBefore,thinking]);setChat("");
   try{
     const response=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:q,pack:{...pack,customerStrategy:getCustomerStrategy(pack.customer),conversation:conversationBefore.slice(-12).map(m=>({type:m.type||"agent",text:m.text||""})),extractedData:{...(pack.extractedData||{}),agentMessages:undefined}}})});
     const result=await response.json();
     if(!response.ok)throw new Error(result.error||"Agent request failed");
     let reply=result.reply||"I couldn't produce an answer from the supplied pack.";
     let savedPack=pack;
     if(result.action==="suggest_field_updates"&&Array.isArray(result.suggestions)&&result.suggestions.length){
       reply+=(/not changed|confirm/i.test(reply)?"":" I have not changed the extracted data. Please confirm below if you want these email-sourced values added.");
     }
     if(result.action==="approve_weight_apportionment"){
       const data=JSON.parse(JSON.stringify(pack.extractedData||{}));
       data.weightApportionmentDecision={
         status:"approved",
         approvedBy:currentUserName,
         approvedAt:new Date().toISOString(),
         method:"line-value net allocation, then net-ratio gross allocation",
         maxDecimalPlaces:3
       };
       savedPack={...pack,extractedData:data,status:"Needs review",validationStatus:undefined,validationChecks:undefined,postedToLCAAt:undefined};
       savedPack=typeof persistValidatedPack==="function"?await persistValidatedPack(savedPack):savedPack;
       reply+=" I applied the configured weight apportionment method: net weight by line value, then gross weight by the resulting net-weight ratio, rounded to a maximum of 3 decimal places. The derived line weights have been applied and the pack has been revalidated.";
     }
     if(result.action==="update_field"&&result.target){
       const target={...result.target};
       if(target.scope==="line"){
         const aliases={grossWeight:"grossMassKg",grossMass:"grossMassKg",gross_mass:"grossMassKg",netWeight:"netMassKg",netMass:"netMassKg",net_mass:"netMassKg"};
         target.field=aliases[target.field]||target.field;
         const explicitLine=q.match(/\bline\s*(\d+)\b/i);
         if(explicitLine) target.lineIndex=Number(explicitLine[1])-1;
       }
       const data=JSON.parse(JSON.stringify(pack.extractedData||{}));
       if(target.scope==="line"&&Number.isInteger(target.lineIndex)&&data.lines?.[target.lineIndex]) data.lines[target.lineIndex][target.field]=target.value;
       else if(target.scope==="primary"&&target.field) data[target.field]=target.value;
       else throw new Error("The agent returned an invalid correction target.");
       data.reviewOverrides=[...(data.reviewOverrides||[]),{scope:target.scope,field:target.field,lineIndex:target.lineIndex??null,oldValue:target.scope==="line"?pack.extractedData?.lines?.[target.lineIndex]?.[target.field]:pack.extractedData?.[target.field],newValue:target.value,sourceDocumentId:target.sourceDocumentId||null,sourcePage:target.sourcePage||null,createdAt:new Date().toISOString()}];
       savedPack={...pack,extractedData:data,status:"Needs review",validationStatus:undefined,validationChecks:undefined,postedToLCAAt:undefined};
       reply+=" I saved that correction to the pack and cleared the previous validation result. The affected data needs to be validated again.";
     }
     const agentMessage={
       type:result.action==="suggest_field_updates"?"fieldSuggestion":"agent",
       text:reply,
       sourceDocumentId:result.target?.sourceDocumentId||null,
       sourcePage:result.target?.sourcePage||null,
       suggestions:Array.isArray(result.suggestions)?result.suggestions:[],
       handled:null,
       persist:true
     };
     const completed=[...conversationBefore,agentMessage];
     setMessages(completed);
     const data=JSON.parse(JSON.stringify(savedPack.extractedData||{}));
     data.agentMessages=completed.filter(m=>m.persist!==false).map(serialiseMessage);
     const finalPack={...savedPack,extractedData:data};
     updatePack?.(finalPack);
   }catch(error){
     const failed={type:"agent",text:"I couldn't reach the review agent. "+error.message,persist:true};
     const completed=[...conversationBefore,failed];
     setMessages(completed);
     const data=JSON.parse(JSON.stringify(pack.extractedData||{}));data.agentMessages=completed.filter(m=>m.persist!==false).map(serialiseMessage);
     const finalPack={...pack,extractedData:data};
     updatePack?.(finalPack);
   }finally{setIsSending(false);}
 };
 const decideWeightApportionment=()=>{
   const data=JSON.parse(JSON.stringify(pack.extractedData||{}));
   data.weightApportionmentDecision={
     status:"approved",
     approvedBy:currentUserName,
     approvedAt:new Date().toISOString(),
     method:"line-value net allocation, then net-ratio gross allocation"
   };
   const next={...pack,extractedData:data,status:"Needs review",validationStatus:undefined,validationChecks:undefined,postedToLCAAt:undefined};
   updatePack?.(next);
   notify?.("Weight apportionment approved — validating the derived line weights");
   if(typeof persistValidatedPack==="function") setTimeout(()=>persistValidatedPack(next,true),0);
   else notify?.("Weight apportionment saved — press Validate data to run the checks");
 };
 const declineWeightApportionment=()=>{
   const data=JSON.parse(JSON.stringify(pack.extractedData||{}));
   data.weightApportionmentDecision={
     status:"declined",
     declinedBy:currentUserName,
     declinedAt:new Date().toISOString()
   };
   const next={...pack,extractedData:data,status:"Needs review",validationStatus:undefined,validationChecks:undefined,postedToLCAAt:undefined};
   updatePack?.(next);
   notify?.("Weight apportionment declined — line weights remain unresolved");
   setMessages(current=>[...current,{type:"agent",text:"Understood. I will not apportion the document-level weights. The pack will remain on review until line-level weights are provided or a different source is selected.",persist:true}]);
 };

 const decideWeights=(source,conflicts)=>{
   const data=JSON.parse(JSON.stringify(pack.extractedData||{}));
   const sourceLabel=source==="packing_list"?"Packing List":"Commercial Invoice";
   let changed=0;
   (data.lines||[]).forEach(inv=>{
     const match=conflicts.find(c=>String(c.invoice.description||"").trim().toLowerCase()===String(inv.description||"").trim().toLowerCase());
     if(!match)return;
     inv.netMassKg=source==="packing_list"?match.line.netMassKg:match.invoice.netMassKg;
     inv.grossMassKg=source==="packing_list"?match.line.grossMassKg:match.invoice.grossMassKg;
     inv.weightSource=source;
     changed++;
   });
   data.weightSourceDecision={source,sourceLabel,selectedAt:new Date().toISOString(),linesChanged:changed};
   data.weightSelectionStatus="resolved";
   const next={...pack,extractedData:data,status:"Needs review",validationStatus:undefined,validationChecks:undefined,postedToLCAAt:undefined};
   updatePack?.(next);
   notify?.(sourceLabel+" weights selected — "+changed+" line"+(changed===1?"":"s")+" updated");
 };
 const emailCustomerReview=checks=>{
   const currentChecks=Array.isArray(checks)?checks:validateStandardCustomsRecord(pack.extractedData||{}).checks;
   const missing=currentChecks.filter(check=>/missing|not extracted|required.*value/i.test(String(check.detail||check.message||"")));
   const conflicts=pack.extractedData?.weightSourceDecision?.source?[]:getWeightConflicts();
   if(!missing.length&&!conflicts.length)return;
   const displayValue=v=>v===undefined||v===null||v===""?"—":String(v);
   const sections=[];
   if(missing.length){
     sections.push("MISSING INFORMATION\\n\\n"+missing.map(check=>"- "+(check.label||check.check||"Required information")+": "+(check.detail||"Missing from the supplied documents.")).join("\\n"));
   }
   if(conflicts.length){
     sections.push("WEIGHT DISCREPANCY\\n\\nThe Commercial Invoice and Packing List contain different line-level weights. Please confirm which weights should be used for the customs declaration.\\n\\n"+conflicts.map(c=>"- "+(c.invoice.description||"Goods line")+": Commercial Invoice net "+displayValue(c.invoice.netMassKg)+" kg / gross "+displayValue(c.invoice.grossMassKg)+" kg; Packing List net "+displayValue(c.line.netMassKg)+" kg / gross "+displayValue(c.line.grossMassKg)+" kg.").join("\\n"));
   }
   const subject=missing.length&&conflicts.length
     ?"Customs IDP - information and weight confirmation required"
     :missing.length
       ?"Customs IDP - missing information required"
       :"Customs IDP - weight confirmation required";
   const body="Hello,\\n\\nWe are preparing your customs declaration and need the following information/confirmation before we can complete it.\\n\\n"+sections.join("\\n\\n")+"\\n\\nPlease provide the missing information and/or confirm the correct weights so we can complete the customs declaration.\\n\\nRegards\\nCustoms IDP";
   setEmailDraft({to:"",subject,body});
 };
 const renderMessage=(m,i)=>{
   const source=m.sourceDocumentId&&m.sourcePage?sourceButton(m.sourceLabel||("Source — page "+m.sourcePage),m.sourceDocumentId,m.sourcePage):null;
   if(m.type==="fieldSuggestion"&&Array.isArray(m.suggestions)){
     return <div className="chat-message-row agent" key={i}>
       <div className="chat-message-avatar"><Sparkles size={15}/></div>
       <div className="chat-message-content">
         <div className="chat-message-text">{m.text}</div>
         <div className="field-suggestion-card">
           <div className="field-suggestion-title"><b>Suggested changes</b><span>Source: email</span></div>
           <div className="field-suggestion-list">
             {m.suggestions.map((suggestion,index)=><div className="field-suggestion-row" key={index}>
               <div><b>Line {Number(suggestion.lineIndex)+1}</b><span>{suggestion.reason||"Value found in the email source."}</span></div>
               <strong>{suggestion.field==="hsCode"?"HS code":suggestion.field==="invoiceNumber"?"Invoice number":suggestion.field==="exporterEoriNo"?"EORI":suggestion.field}: {suggestion.value}</strong>
             </div>)}
           </div>
           {m.handled==="applied"
             ? <div className="field-suggestion-result success"><CheckCircle2 size={14}/> Added to working customs data</div>
             : m.handled==="ignored"
               ? <div className="field-suggestion-result">No changes made</div>
               : <div className="field-suggestion-actions"><button type="button" className="primary" onClick={()=>applySuggestedFields(m.suggestions,i)}>Add to customs data</button><button type="button" className="secondary" onClick={()=>ignoreSuggestedFields(i)}>Don't add</button></div>}
         </div>
       </div>
     </div>;
   }
   if(m.type==="weightApportionmentDecision"){
     return <div className="chat-message-row agent" key={i}><div className="chat-message-avatar"><Sparkles size={15}/></div><div className="chat-message-content"><div className="chat-message-text">{m.text}</div><div className="weight-decision-actions"><button className="secondary" onClick={decideWeightApportionment}>Apply weight apportionment</button><button className="secondary" onClick={declineWeightApportionment}>Do not apply</button><button className="secondary" onClick={()=>emailCustomerReview()}><Mail size={15}/> Email customer</button></div></div></div>;
   }
   if(m.type==="weightDecision"){
     return <div className="chat-message-row agent" key={i}><div className="chat-message-avatar"><Sparkles size={15}/></div><div className="chat-message-content"><div className="chat-message-text">{m.text.split("\n").map((x,j)=><React.Fragment key={j}>{x}{j<m.text.split("\n").length-1&&<br/>}</React.Fragment>)}</div><div className="weight-decision-actions"><button className="secondary" onClick={()=>decideWeights("invoice",m.conflicts)}>Use Commercial Invoice weights</button><button className="secondary" onClick={()=>decideWeights("packing_list",m.conflicts)}>Use Packing List weights</button><button className="secondary" onClick={()=>emailCustomerReview()}><Mail size={15}/> Email customer</button></div></div></div>;
   }
   if(m.type==="customsEntrySummary"&&m.summary){
     const s=m.summary;
     const addressLines=(structured,fullAddress,fallback)=>{
       const raw=structured||fullAddress||"";
       const lines=String(raw).split(/,|\\n/).map(x=>x.trim()).filter(Boolean);
       return lines.length?lines:[fallback];
     };
     const renderAddress=(structured,fullAddress,fallback)=>{
       const hasStructured=Boolean(String(structured||"").trim());
       const lines=addressLines(structured,fullAddress,fallback);
       return <>{lines.map((line,idx)=><span key={idx}>{line}</span>)}</>;
     };
     return <div className="chat-message-row agent" key={i}>
       <div className="chat-message-avatar"><Sparkles size={15}/></div>
       <div className="chat-message-content">
         <div className="customs-entry-summary-card">
           
           {s.weightSourceDecision&&<div className="weight-source-selected"><CheckCircle2 size={15}/><span><b>Working weights:</b> {s.weightSourceDecision==="packing_list"?"Packing List":"Commercial Invoice"} selected. The selected values are now used for customs validation and downstream data.</span></div>}
           <div className="customs-party-grid">
             <div className="customs-party-card">
               <span className="customs-party-label">Exporter</span>
               <b>{s.exporter||"—"}</b>
               <div className="customs-address-block">
                 {s.exporterAddressLine1
                   ? <>
                       <span><strong>Address line 1:</strong> {s.exporterAddressLine1}</span>
                       <span><strong>Postcode/ZIP:</strong> {s.exporterPostcode||"—"}</span>
                       <span><strong>City:</strong> {s.exporterCity||"—"}</span>
                       <span><strong>Country:</strong> {s.exporterCountryIso||"—"}</span>
                     </>
                   : renderAddress("",s.exporterAddress,"—")}
                 <span><strong>EORI:</strong> {s.exporterEoriNo||"—"}</span>
               </div>
             </div>
             <div className="customs-party-card">
               <span className="customs-party-label">Importer</span>
               <b>{s.consignee||"—"}</b>
               <div className="customs-address-block">
                 {s.consigneeAddressLine1
                   ? <>
                       <span><strong>Address line 1:</strong> {s.consigneeAddressLine1}</span>
                       <span><strong>Postcode/ZIP:</strong> {s.consigneePostcode||"—"}</span>
                       <span><strong>City:</strong> {s.consigneeCity||"—"}</span>
                       <span><strong>Country:</strong> {s.consigneeCountryIso||"—"}</span>
                     </>
                   : renderAddress("",s.consigneeAddress,"—")}
               </div>
             </div>
           </div>
           <div className="customs-header-table">
             <div><span>Invoice number</span><b>{s.invoice||"—"}</b></div>
             <div><span>Currency</span><b>{s.currency||"—"}</b></div>
             <div><span>Invoice Value</span><b>{s.invoiceValue?((s.currency||"")+" "+s.invoiceValue):"—"}</b></div>
             <div><span>Export</span><b>{s.exportCountry||"—"}</b></div>
             <div><span>Destination</span><b>{s.destination||"—"}</b></div>
             <div><span>Packages</span><b>{s.packages||"—"}</b></div>
             <div><span>Gross Weight</span><b>{s.gross?s.gross+" kg":"—"}</b></div>
             <div><span>Net Weight</span><b>{s.net?s.net+" kg":"—"}</b></div>
             <div><span>Freight Cost</span><b>{s.freightAmount?((s.freightCurrency||s.currency||"")+" "+s.freightAmount):"—"}</b></div>
             <div><span>Freight Currency</span><b>{s.freightCurrency||"—"}</b></div>
             <div><span>Delivery Term</span><b>{s.deliveryTerm||"—"}</b></div>
           </div>
           <div className="customs-summary-section">
             <div className="summary-section-title">Goods lines <span>{s.lines.length}</span></div>
             <div className="customs-line-table-wrap">
               <table className="customs-line-table">
                 <thead><tr><th>Line</th><th>Goods Description</th><th>HS Code</th><th>Origin</th><th>Qty</th><th>Net Weight (kg)</th><th>Gross Weight (kg)</th><th>Value</th></tr></thead>
                 <tbody>{s.lines.map(line=><tr key={line.no}><td>{line.no}</td><td>{line.description}</td><td>{line.hs||"—"}</td><td>{line.origin||"—"}</td><td>{line.quantity||"—"}</td><td>{line.net||"—"}</td><td>{line.gross||"—"}</td><td>{line.itemValue?(s.currency+" "+line.itemValue):"—"}</td></tr>)}</tbody>
               </table>
             </div>
           </div>
           {source&&<div className="summary-source">{source}</div>}
         </div>
       </div>
     </div>;
   }
   if(m.type==="agentIssues"&&Array.isArray(m.issues)){
     return <div className="chat-message-row agent" key={i}><div className="chat-message-avatar"><AlertCircle size={15}/></div><div className="chat-message-content"><div className="validation-summary-card agent-issues-card"><div className="customs-summary-title"><div><span className="summary-kicker">ATTENTION REQUIRED</span><h3>Issues found during document review</h3></div></div><div className="validation-check-list">{m.issues.map((issue,idx)=><div className="validation-check warning" key={idx}><span>!</span><div><b>{issue.title}</b><small>{issue.detail}</small>{issue.sourceDocumentId&&<div className="chat-source">{sourceButton("Open source document",issue.sourceDocumentId,issue.sourcePage||1)}</div>}</div></div>)}</div></div></div></div>;
   }
   if(m.type==="validationSummary"&&Array.isArray(m.checks)){
     const failures=m.checks.filter(check=>check.status==="fail");
     const reviews=m.checks.filter(check=>check.status==="review");
     const passed=m.checks.filter(check=>check.status==="pass");
     const notApplicable=m.checks.filter(check=>check.status==="not_applicable");
     const renderCheck=(check,idx,status)=> <div className={"validation-check "+status} key={status+"-"+idx}><span>{status==="pass"?"✓":status==="not_applicable"?"—":"!"}</span><div><b>{check.label||check.check||"Validation check"}</b><small>{check.detail||check.message||""}</small>{status==="review"&&(check.label||check.check)==="Weight source decision"&&<div className="validation-weight-actions"><button type="button" className="secondary" onClick={()=>decideWeights("invoice",getWeightConflicts())}>Use Commercial Invoice</button><button type="button" className="secondary" onClick={()=>decideWeights("packing_list",getWeightConflicts())}>Use Packing List</button><button type="button" className="secondary" onClick={()=>emailCustomerReview()}><Mail size={13}/> Email customer</button></div>}</div></div>;
     return <div className="chat-message-row agent" key={i}><div className="chat-message-avatar"><ShieldCheck size={15}/></div><div className="chat-message-content"><div className="validation-summary-card">
       <div className="customs-summary-title"><div><span className="summary-kicker">VALIDATION RESULTS</span><h3>Document and customs checks</h3></div></div>
       {failures.length>0&&<div className="validation-group"><div className="validation-group-title">❌ {failures.length} issue{failures.length===1?"":"s"} found</div><div className="validation-check-list">{failures.map((check,idx)=>renderCheck(check,idx,"fail"))}{failures.some(check=>/missing|not extracted|required.*value/i.test(String(check.detail||check.message||"")))&&<div className="validation-missing-actions"><button type="button" className="secondary" onClick={()=>emailCustomerReview(failures)}><Mail size={13}/> Email customer for missing information</button></div>}</div></div>}
       {reviews.length>0&&<div className="validation-group"><div className="validation-group-title">⚠️ {reviews.length} decision{reviews.length===1?"":"s"} required</div><div className="validation-check-list">{reviews.map((check,idx)=>renderCheck(check,idx,"review"))}</div></div>}
       {!failures.length&&!reviews.length&&<div className="validation-success-message">✓ No validation issues found.</div>}
       <details className="validation-details"><summary>Show passed checks ({passed.length}){notApplicable.length?" · "+notApplicable.length+" not applicable":""}</summary><div className="validation-check-list">{passed.map((check,idx)=>renderCheck(check,idx,"pass"))}{notApplicable.map((check,idx)=>renderCheck(check,idx,"not_applicable"))}</div></details>
     </div></div></div>;
   }
   return <div className={"chat-message-row "+(m.type||"agent")} key={i}><div className="chat-message-avatar">{m.type==="user"?"You":<Sparkles size={15}/>}</div><div className="chat-message-content"><div className="chat-message-text">{m.text}</div>{source&&<div className="chat-source">{source}</div>}</div></div>;
 };

 const summaryHeaderData=pack.workingRecord||{};
 const summaryFallbackData=pack.extractedData||{};
 const summaryInvoiceNumber=summaryHeaderData.invoiceNumber||summaryHeaderData.invoiceNo||summaryHeaderData.invoice||summaryFallbackData.invoiceNumber||summaryFallbackData.invoiceNo||summaryFallbackData.invoice||"—";

 return <section className="review-chat-page">
   <button className="back" onClick={back}>← Back to inbox</button>
   <div className="review-head"><div><div className="eyebrow">{pack.id} · {pack.ticket}</div><h1>{getPackCustomerLabel(pack)}</h1><p>{pack.docs} Documents · Received {formatReceivedDateTime(pack.received)}</p></div><div className="review-actions"><select className="owner-select review-owner" value={pack.assignedTo||"Unassigned"} onChange={e=>onAssign?.(pack.id,e.target.value)}><option>Unassigned</option><option>Liam Wingrove</option><option>Data Processor 1</option><option>Data Processor 2</option><option>Muhammad Amer</option></select><Status status={pack.status}/><button className="secondary" onClick={()=>reprocessPack?.(pack)}>Re-process</button><button className="secondary" onClick={validatePack}>Validate data</button><button className={pack.status==="Ready"?"primary":"secondary"} onClick={postToLCA}>Post to LCA</button></div></div>
   <div className="chat-review-panel chat-review-full">
     <div className="chat-review-head"><div className="agent-title"><div className="agent-orb"><Sparkles size={18}/></div><div><b>Extraction Agent</b><span>Source-grounded document review</span></div></div><div className="chat-review-head-actions"><button type="button" className="secondary review-show-summary-btn" onClick={()=>setShowSummary(true)}><FileText size={14}/> Customs summary</button>{pack.email&&<button type="button" className="secondary review-show-email-btn" onClick={()=>setShowEmailSource(true)}><Mail size={14}/> Show email</button>}<button type="button" className="secondary review-show-document-btn" onClick={()=>{setSelectedDocumentId(selectedDocumentId||(documentRows[0]?.id||documentRows[0]?.name));setPreviewPage(1);setShowPreview(true);}}><FileText size={14}/> Show document</button></div></div>
     <div className="chat-review-intro">I read the complete document pack first. The conversation below is the review record: extracted values stay connected to their source, and discrepancies are surfaced rather than silently resolved.</div>
   
     {pack.processingError&&<div className="reprocess-error-banner"><div><b>Re-processing failed</b><span>{pack.processingError}</span></div><button type="button" className="secondary" onClick={()=>reprocessPack?.(pack)}>Try again</button></div>}
     <div ref={chatHistoryRef} className="chat-history chat-review-history">{messages.map(renderMessage)}</div>
     <div className="chat-input chat-review-input"><input value={chat} onChange={e=>setChat(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Ask where a value came from, why it was used, or tell the agent what to change..."/><button onClick={sendChat}><ArrowRight size={16}/></button></div>
   </div>
   {showSummary&&<div className="customs-summary-modal-overlay" onClick={()=>setShowSummary(false)}><div className="customs-summary-modal" onClick={e=>e.stopPropagation()}><div className="customs-summary-modal-head"><div><span className="summary-kicker">CUSTOMS ENTRY SUMMARY</span></div><button type="button" className="row-btn" onClick={()=>setShowSummary(false)}><X size={18}/></button></div><div className="customs-summary-modal-body">{buildSummary().find(m=>m.type==="customsEntrySummary") ? renderMessage(buildSummary().find(m=>m.type==="customsEntrySummary"),0) : <div className="review-document-empty"><FileText size={28}/><b>Customs summary not available</b><span>Waiting for document extraction to complete.</span></div>}</div></div></div>}
   {showEmailSource&&pack.email&&<div className="review-source-modal-overlay" onClick={()=>setShowEmailSource(false)}>
     <div className="review-email-modal" onClick={e=>e.stopPropagation()}>
       <div className="review-email-modal-head"><div><span className="summary-kicker">EMAIL SOURCE</span><b>{pack.email.subject||"Customs IDP email"}</b></div><button type="button" className="row-btn" onClick={()=>setShowEmailSource(false)}><X size={18}/></button></div>
       <div className="review-email-modal-meta">
         {pack.email.from&&<div><span>From</span><b>{pack.email.from}</b></div>}
         {pack.email.to&&<div><span>To</span><b>{pack.email.to}</b></div>}
         {pack.email.receivedAt&&<div><span>Received</span><b>{new Date(pack.email.receivedAt).toLocaleString("en-GB")}</b></div>}
       </div>
       {(pack.email.text||pack.email.html)&&<div className="review-email-modal-body"><span>Email body</span><div>{String(pack.email.text||pack.email.html||"").replace(/<[^>]*>/g,"").trim()}</div></div>}
       <div className="review-email-modal-note">Email content is retained as source context. Customs data is extracted from the attached documents unless the Review Agent explicitly identifies email content as supporting context.</div>
     </div>
   </div>}
   {showPreview&&selectedDocumentUrl&&<div className="review-source-modal-overlay" onClick={()=>setShowPreview(false)}>
     <div className="review-source-modal" onClick={e=>e.stopPropagation()}>
       <div className="review-source-modal-head">
         <div><span>{selectedDocumentIsPdf?"DOCUMENT SOURCE · PAGE "+previewPage:selectedDocumentIsSpreadsheet?"DOCUMENT SOURCE · EXCEL PREVIEW":"DOCUMENT SOURCE · IMAGE PREVIEW"}</span><b>{selectedDocument?.name||"Source document"}</b></div>
         <button type="button" className="row-btn" onClick={()=>setShowPreview(false)}><X size={18}/></button>
       </div>
       <div className="review-source-modal-toolbar"><div className="review-document-picker"><FileText size={14}/><select value={selectedDocumentId||""} onChange={e=>{setSelectedDocumentId(e.target.value);setPreviewPage(1);}} aria-label="Select source document">{documentRows.map(doc=><option key={doc.id||doc.name} value={doc.id||doc.name}>{doc.name}</option>)}</select></div>{selectedDocumentIsSpreadsheet&&<span className="spreadsheet-preview-status">Excel preview loading…</span>}{selectedDocumentIsPdf&&<div className="review-viewer-controls"><span>Page {previewPage}</span><button type="button" onClick={()=>setPreviewPage(p=>Math.max(1,p-1))}>−</button><button type="button" onClick={()=>setPreviewPage(p=>p+1)}>+</button></div>}</div>
       <div className={"review-source-modal-body "+(selectedDocumentIsSpreadsheet?"spreadsheet-document":selectedDocumentIsImage?"image-document":"pdf-document")}>{selectedDocumentUrl?(selectedDocumentIsSpreadsheet?<SpreadsheetPreview url={selectedDocumentUrl} sheetIndex={previewPage} setSheetIndex={setPreviewPage}/>:selectedDocumentIsImage?<img src={selectedDocumentUrl} alt={selectedDocument?.name||"Document preview"}/>:<iframe src={selectedDocumentFrameUrl} title={selectedDocument?.name||"Document preview"}/>):<div className="review-document-empty"><FileText size={28}/><b>{selectedDocument?.name||"No document available"}</b><span>The document is not available for preview yet.</span></div>}</div>
     </div>
   </div>}
   {emailDraft&&<div className="email-draft-overlay" onClick={()=>setEmailDraft(null)}><div className="email-draft-modal" onClick={e=>e.stopPropagation()}><div className="email-draft-head"><div><span className="summary-kicker">EMAIL CUSTOMER</span><h3>Weight confirmation request</h3></div><button type="button" className="row-btn" onClick={()=>setEmailDraft(null)}><X size={17}/></button></div><label>To<input value={emailDraft.to} onChange={e=>setEmailDraft({...emailDraft,to:e.target.value})} placeholder="customer@email.com" autoFocus/></label><label>Subject<input value={emailDraft.subject} onChange={e=>setEmailDraft({...emailDraft,subject:e.target.value})}/></label><label>Message<textarea rows="10" value={emailDraft.body} onChange={e=>setEmailDraft({...emailDraft,body:e.target.value})}/></label><div className="email-draft-actions"><button type="button" className="secondary" onClick={()=>{navigator.clipboard?.writeText(emailDraft.body);notify?.("Email message copied to clipboard");}}>Copy message</button><button type="button" className="primary" disabled={!emailDraft.to.trim()} onClick={()=>{window.location.href="mailto:"+encodeURIComponent(emailDraft.to.trim())+"?subject="+encodeURIComponent(emailDraft.subject)+"&body="+encodeURIComponent(emailDraft.body);setEmailDraft(null);}}>Open email</button></div></div></div>}
 </section>
}
function Customers({notify}){
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [organisation,setOrganisation]=useState(null);
  const [teamCount,setTeamCount]=useState(0);
  const [customerRows,setCustomerRows]=useState([]);

  const loadCustomers=async()=>{
    setLoading(true);
    setError("");
    try{
      const response=await fetch("/api/organisation?action=customers",{credentials:"include"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Unable to load organisation customers.");
      const rows=Array.isArray(data.customers)?data.customers:[];
      setOrganisation(data.organisation||null);
      setTeamCount(Array.isArray(data.teams)?data.teams.length:0);
      setCustomerRows(rows);
      rows.forEach(customer=>{
        customerStrategyStore[customer.name]={
          ...(customer.strategy||{}),
          autoApplyWeightApportionment:customer.strategy?.autoApplyWeightApportionment===true,
          emailFields:Array.isArray(customer.strategy?.emailFields)?customer.strategy.emailFields:[]
        };
      });
    }catch(e){
      setError(e.message||"Unable to load customers.");
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{loadCustomers();},[]);

  return <section>
    <div className="page-head">
      <div>
        <div className="eyebrow">Configuration</div>
        <h1>Customers</h1>
        <p>Customer-specific extraction strategies, mailboxes and validation rules.</p>
        {organisation&&<span className="summary-kicker">{organisation.name} · {teamCount} team{teamCount===1?"":"s"}</span>}
      </div>
      <button className="primary" onClick={()=>notify("Customer creation flow opened")}><Plus size={17}/> Add customer</button>
    </div>

    {loading&&<div className="panel"><div className="setting-status">Loading organisation customers…</div></div>}
    {!loading&&error&&<div className="panel"><div className="password-login-error">{error}</div><button className="secondary" onClick={loadCustomers}>Retry</button></div>}
    {!loading&&!error&&<div className="customer-grid">
      {customerRows.map(c=><div className="customer-card" key={c.id||c.code}>
        <div className="customer-top">
          <div className="customer-logo">{c.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div>
          <button className="row-btn" type="button"><MoreHorizontal size={17}/></button>
        </div>
        <h3>{c.name}</h3>
        <span className="code">{c.code}</span>
        <div className="customer-info">
          <div><Mail size={15}/><span>{c.mailbox||"No mailbox assigned"}</span></div>
          <div><Settings size={15}/><span>{c.rules} strategy rules · v{c.strategyVersion||1}</span></div>
          <div><Activity size={15}/><span>{c.processed.toLocaleString()} documents processed</span></div>
        </div>
        <button className="full-btn" type="button" onClick={()=>notify(c.strategyStatus?c.name+" strategy v"+c.strategyVersion+" loaded":"No active strategy configured")}>Open strategy <ArrowRight size={15}/></button>
      </div>)}
    </div>}
  </section>;
}

function AgentPage(){
 const [selectedAgent,setSelectedAgent]=useState("review");
 const [messages,setMessages]=useState([{role:"agent",text:"I am the Review & Decision Agent. I work with the extracted pack, source evidence, customer strategy and validation results to explain decisions, make user-approved corrections and resolve review exceptions."}]);
 const [input,setInput]=useState("");

 const agents=[
   {
     id:"extract",
     name:"Document Extraction Agent",
     status:"Online",
     model:"GPT-5.6 Luna",
     endpoint:"/api/extract",
     type:"AI agent",
     icon:<FileText size={18}/>,
     role:"Reads the complete document pack and creates the canonical source extraction.",
     tasks:[
       "Classify each document",
       "Extract header and party data",
       "Extract every goods line separately",
       "Capture line-level net and gross weights",
       "Extract freight and invoice totals",
       "Record field evidence and confidence"
     ],
     knowledge:[
       "Commercial invoices",
       "Packing lists",
       "CMR and transport documents",
       "Exporter / importer address structures",
       "UK EORI identification",
       "ISO 3166-1 country codes",
       "Line values, quantities and weights",
       "Freight and invoice totals",
       "Source evidence and page references"
     ]
   },
   {
     id:"review",
     name:"Review & Decision Agent",
     status:"Online",
     model:"GPT-5.6 Luna",
     endpoint:"/api/agent",
     type:"AI agent",
     icon:<Sparkles size={18}/>,
     role:"Works with a live pack to explain extraction, handle corrections, surface discrepancies and guide human decisions.",
     tasks:[
       "Explain where an extracted value came from",
       "Make explicit user-approved corrections",
       "Compare primary and supporting documents",
       "Handle weight-source decisions",
       "Apply approved weight apportionment",
       "Explain validation failures",
       "Use customer strategy when supplied",
       "Keep corrections auditable"
     ],
     knowledge:[
       "Current pack and uploaded documents",
       "Field evidence and source pages",
       "Primary invoice hierarchy",
       "Supporting-document fallback rules",
       "Customer-specific strategy",
       "Middleware field mapping",
       "Standard validation results",
       "Weight reconciliation and apportionment",
       "Freight reconciliation",
       "UK customs / EORI rules"
     ]
   }
 ];

 const supporting=[
   {name:"Standard Validation Engine",type:"Deterministic engine",icon:<ShieldCheck size={17}/>,description:"Runs repeatable customs and middleware checks without relying on an AI judgement.",items:["Required-field checks","ISO country validation","HS / procedure-code validation","Line and header weight reconciliation","Invoice + same-currency freight reconciliation","EORI and address checks"]},
   {name:"Customer Strategy Layer",type:"Rules & configuration",icon:<Settings size={17}/>,description:"Supplies customer-specific rules to the workflow. It is configuration, not a separate AI agent.",items:["Customer extraction rules","Weight apportionment settings","Customer-specific validation","Mailbox / customer context","Future rule versioning and audit trail"]}
 ];

 const selected=agents.find(agent=>agent.id===selectedAgent)||agents[1];

 const send=(textValue=input)=>{
   const q=textValue.trim(); if(!q) return;
   setMessages(m=>[...m,{role:"user",text:q}]); setInput("");
   const l=q.toLowerCase(); let reply;
   const outOfScope=/\b(recipe|recipes|cook|cooking|soup|meal|dinner|lunch|breakfast|weather|forecast|football|soccer|sport|sports|betting|odds|movie|movies|film|films|music|song|songs|game|games|gaming|joke|jokes|poem|poetry|dating|relationship|homework|essay|school|university|maths|mathematics)\b/i.test(q);
   if(outOfScope) reply="I’m restricted to Customs IDP work. I can explain this agent, its supplied knowledge, the current customs workflow, validation, source evidence, customer strategy or document-review decisions.";
   else if(l.includes("knowledge")) reply=selected.name+" has access to "+selected.knowledge.slice(0,5).join(", ")+". Its context is supplied by the platform for the current workflow rather than a generic answer.";
   else if(l.includes("gross")||l.includes("weight")) reply="The Review & Decision Agent can use the pack's document-level and line-level weight evidence, the selected source and the customer strategy. When apportionment is approved, the platform applies the configured method and keeps the resulting values in the working record.";
   else if(l.includes("extract")) reply="The Document Extraction Agent reads the complete uploaded document and returns structured customs data, line items, evidence and confidence. It does not apply customer rules or silently guess missing values.";
   else if(l.includes("validate")) reply="Validation is deliberately separate from the AI agents. The Standard Validation Engine performs deterministic checks, then the Review & Decision Agent can explain the result and help resolve any human decision.";
   else if(l.includes("rule")||l.includes("customer")) reply="Customer strategy is supplied as configuration to the workflow. The Review & Decision Agent can use those supplied rules, but it should not invent or apply a customer-specific rule that is not present in the pack context.";
   else if(l.includes("change")||l.includes("correct")||l.includes("wrong")) reply="The Review & Decision Agent can make an explicit correction when the user specifies the new value. It records the instruction, updates the working data and the platform can re-run validation.";
   else reply="This Agent Control Centre shows which intelligence component is responsible for each stage, the knowledge it is given, and the deterministic controls that sit around it.";
   setTimeout(()=>setMessages(m=>[...m,{role:"agent",text:reply}]),180);
 };

 return <section>
   <div className="page-head">
     <div><div className="eyebrow">Automation & intelligence</div><h1>AI Agents</h1><p>See which agents process customs data, what they do and the operational knowledge supplied to them.</p></div>
     <span className="online-pill"><span></span> 2 AI agents online</span>
   </div>

   <div className="agent-control-hero">
     <div className="agent-control-hero-icon"><Bot size={24}/></div>
     <div className="agent-control-hero-copy">
       <div className="eyebrow">Current AI architecture</div>
       <h2>Customs IDP intelligence layer</h2>
       <p>Two specialised AI agents work around a deterministic validation engine and customer strategy layer. This keeps extraction flexible while keeping critical validation repeatable.</p>
     </div>
     <div className="agent-control-hero-stat"><b>2</b><span>AI agents</span></div>
     <div className="agent-control-hero-stat"><b>1</b><span>Validation engine</span></div>
   </div>

   <div className="agent-directory">
     <div className="agent-directory-head"><div><span className="summary-kicker">AI AGENT DIRECTORY</span><h2>Agents in this platform</h2><p>Select an agent to see its role, tasks and specific knowledge.</p></div></div>
     <div className="agent-directory-grid">
       {agents.map(agent=><button type="button" className={"agent-directory-card "+(selectedAgent===agent.id?"selected":"")} key={agent.id} onClick={()=>setSelectedAgent(agent.id)}>
         <div className="agent-directory-card-top"><div className="agent-directory-icon">{agent.icon}</div><span className="agent-online"><i></i>{agent.status}</span></div>
         <h3>{agent.name}</h3>
         <span className="agent-directory-type">{agent.type} · {agent.model}</span>
         <p>{agent.role}</p>
         <div className="agent-directory-meta"><span>{agent.tasks.length} tasks</span><span>{agent.knowledge.length} knowledge areas</span></div>
       </button>)}
     </div>
   </div>

   <div className="agent-detail-grid">
     <div className="panel agent-detail-panel">
       <div className="panel-head">
         <div><span className="summary-kicker">SELECTED AGENT</span><h2>{selected.name}</h2><p>{selected.endpoint} · {selected.model}</p></div>
         <span className="online-pill"><span></span>{selected.status}</span>
       </div>
       <div className="agent-detail-body">
         <div className="agent-detail-intro"><div className="agent-directory-icon">{selected.icon}</div><div><b>What this agent does</b><p>{selected.role}</p></div></div>
         <div className="agent-detail-section"><h3>Tasks</h3><div className="agent-task-grid">{selected.tasks.map(task=><div className="agent-task" key={task}><CheckCircle2 size={15}/><span>{task}</span></div>)}</div></div>
         <div className="agent-detail-section"><h3>Specific knowledge supplied</h3><p className="agent-knowledge-note">This is the operational knowledge/context the agent is designed to use for this workflow. It is not a generic unrestricted knowledge base.</p><div className="agent-knowledge-grid">{selected.knowledge.map(item=><div className="agent-knowledge-chip" key={item}><Zap size={13}/><span>{item}</span></div>)}</div></div>
       </div>
     </div>

     <div className="panel agent-runtime-panel">
       <div className="panel-head"><div><span className="summary-kicker">SUPPORTING INTELLIGENCE</span><h2>Controls around the agents</h2><p>Components that keep the workflow predictable.</p></div></div>
       <div className="supporting-agent-list">
         {supporting.map(item=><div className="supporting-agent" key={item.name}><div className="supporting-agent-head"><div className="supporting-agent-icon">{item.icon}</div><div><b>{item.name}</b><span>{item.type}</span></div></div><p>{item.description}</p><div className="supporting-agent-items">{item.items.map(x=><span key={x}>{x}</span>)}</div></div>)}
       </div>
       <div className="agent-flow"><span>Documents</span><ArrowRight size={14}/><b>Extraction Agent</b><ArrowRight size={14}/><b>Review Agent</b><ArrowRight size={14}/><b>Validation</b><ArrowRight size={14}/><span>Post to LCA</span></div>
     </div>
   </div>

   <div className="panel chat-large agent-chat-control">
     <div className="agent-title"><div className="agent-orb"><Sparkles size={18}/></div><div><b>{selected.name}</b><span>Operational knowledge and workflow assistant</span></div></div>
     <div className="chat-history">
       {messages.map((m,i)=><div className={"message "+m.role} key={i}>{m.text}</div>)}
       <div className="suggestions">
         <button onClick={()=>send("What knowledge does this agent use?")}>What knowledge does this agent use?</button>
         <button onClick={()=>send("Explain the weight rules")}>Explain the weight rules</button>
         <button onClick={()=>send("What does the extraction agent do?")}>What does the extraction agent do?</button>
         <button onClick={()=>send("How does validation work?")}>How does validation work?</button>
       </div>
     </div>
     <div className="chat-input"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask about an agent, its tasks or its knowledge..."/><button onClick={()=>send()}><ArrowRight size={16}/></button></div>
   </div>
 </section>
}
function SettingsPage(){
  const [outlook,setOutlook]=useState({loading:true,connected:false,connection:null});
  const [connecting,setConnecting]=useState(false);
  const [error,setError]=useState("");
  const [invite,setInvite]=useState({name:"",email:"",role:"member"});
  const [inviting,setInviting]=useState(false);
  const [inviteMessage,setInviteMessage]=useState("");

  useEffect(()=>{
    let active=true;
    fetch("/api/outlook?action=status",{credentials:"include"})
      .then(r=>r.json())
      .then(data=>{if(active)setOutlook({loading:false,connected:Boolean(data.connected),connection:data.connection||null});})
      .catch(()=>{if(active)setOutlook({loading:false,connected:false,connection:null});});
    return()=>{active=false;};
  },[]);

  const connectOutlook=async()=>{
    setError("");setConnecting(true);
    try{
      const response=await fetch("/api/outlook?action=connect",{credentials:"include"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Unable to start Outlook connection.");
      window.location.href=data.authorizationUrl;
    }catch(e){setError(e.message||"Unable to start Outlook connection.");setConnecting(false);}
  };

  const sendInvite=async(e)=>{
    e.preventDefault();
    setError("");setInviteMessage("");setInviting(true);
    try{
      const response=await fetch("/api/team",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        credentials:"include",
        body:JSON.stringify(invite)
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Unable to send invitation.");
      setInviteMessage("Invitation sent to "+invite.email+". They will set their password from the invitation link.");
      setInvite({name:"",email:"",role:"member"});
    }catch(e){setError(e.message||"Unable to send invitation.");}
    finally{setInviting(false);}
  };

  return <section>
    <div className="page-head"><div><div className="eyebrow">Platform</div><h1>Settings</h1><p>Core processing, middleware and integration configuration.</p></div></div>
    <div className="settings-grid">
      <div className="panel settings-card">
        <h2>Team access</h2>
        <p>Invite a user to this organisation. The invitation creates their Supabase account and organisation membership together.</p>
        <form onSubmit={sendInvite} className="password-login-form">
          <label>Name<input value={invite.name} onChange={e=>setInvite(v=>({...v,name:e.target.value}))} placeholder="Full name"/></label>
          <label>Email<input type="email" value={invite.email} onChange={e=>setInvite(v=>({...v,email:e.target.value}))} placeholder="name@company.com"/></label>
          <label>Role<select value={invite.role} onChange={e=>setInvite(v=>({...v,role:e.target.value}))}><option value="member">Data Processor</option><option value="manager">Manager</option><option value="admin">Admin</option></select></label>
          {inviteMessage&&<div className="password-login-message">{inviteMessage}</div>}
          {error&&<div className="password-login-error">{error}</div>}
          <button className="primary-action" type="submit" disabled={inviting||!invite.email.trim()}>{inviting?"Sending invitation…":"Invite user"}</button>
        </form>
      </div>

      <div className="panel settings-card">
        <h2>Outlook email intake</h2>
        <p>Connect an Outlook.com mailbox so new customs emails and attachments can enter the IDP pipeline automatically.</p>
        {outlook.loading ? <div className="setting-status">Checking connection…</div> : outlook.connected ? <div className="setting-status"><b>Connected</b><span>{outlook.connection?.email}</span></div> : <button className="primary-action" onClick={connectOutlook} disabled={connecting}>{connecting?"Opening Microsoft…":"Connect Outlook"}</button>}
        {error&&<div className="password-login-error">{error}</div>}
        <small>Access is limited to Microsoft Graph Mail.Read. Customs IDP does not request permission to send or modify email.</small>
      </div>

      <div className="panel settings-card"><h2>Middleware</h2><p>Configure the output contract used by the downstream customs system.</p><label>Endpoint</label><input value="https://middleware.internal/customs/orders" readOnly/><label>Format</label><select><option>JSON</option></select><label>Destination</label><input value="ASM UK" readOnly/></div>
      <div className="panel settings-card"><h2>Processing defaults</h2><p>Global fallbacks used when a customer has no overriding rule.</p><Toggle label="Automatic validation" on/><Toggle label="Low-confidence review queue" on/><Toggle label="Auto-send validated packs" on/></div>
    </div>
  </section>
}
function Toggle({label,on}){return <div className="toggle-row"><span>{label}</span><div className={"toggle "+(on?"on":"")}><i></i></div></div>}

createRoot(document.getElementById("root")).render(<App/>);
// Vercel redeploy trigger after connection reset 2026-09-18T20:26:46.067Z