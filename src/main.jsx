/* Vercel redeploy trigger */
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
import { DEFAULT_INBOX_COLUMNS, customerStrategyStore, customers, getCustomerStrategy, normalizeCountryCode, normaliseDatabasePack, packs } from "./domain/packData.js";
import { buildWorkingCustomsRecord } from "./domain/workingRecord.js";
import { Review } from "./pages/Pages.jsx";
import { AgentPage } from "./pages/AgentPage.jsx";
import { Customers } from "./pages/CustomersPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { Dashboard, ManagerPage } from "./pages/DashboardPages.jsx";
import { InboxPage } from "./pages/InboxPage.jsx";
import { NavItem, Status } from "./components/SharedComponents.jsx";
import { useAuthSession } from "./hooks/useAuthSession.js";
import { usePackWorkspace } from "./hooks/usePackWorkspace.js";
import { runAutomatedEmailAudit } from "./services/agentService.js";
import { deleteUploadedDocument, getUploadedDocument, saveUploadedDocument } from "./services/documentStorage.js";
import { LocalTestLogin, SupabaseLogin, SupabasePasswordSetup } from "./pages/AuthPages.jsx";
import { UploadConfirmModal } from "./components/UploadConfirmModal.jsx";
import { ProcessingReviewGuard } from "./components/ProcessingReviewGuard.jsx";

function App(){
  const [pendingUploadFiles,setPendingUploadFiles]=useState([]);
  const [uploadCustomer,setUploadCustomer]=useState("Unassigned customer");
  const [showUploadConfirm,setShowUploadConfirm]=useState(false);
  const localTestRoute=import.meta.env.DEV&&typeof window!=="undefined"&&window.location.pathname==="/test-auth";
  const {authenticated,currentUser,passwordSetup,setAuthenticated,setCurrentUser,setPasswordSetup}=useAuthSession({localTestRoute});
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
  const { livePacks, setLivePacks, dataSource, packLoadError, setPackLoadError, emailSyncStatus, persistPack } = usePackWorkspace({ authenticated });
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
    setSelectedPack(null);setLivePacks(prev=>prev.map(p=>p.id===pack.id?processing:p));persistPack(processing);navigate("inbox");notify("Re-processing all documents — AI extraction started");
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
      const processed={...processing,status:"Needs review",extractedData:{...(primaryDoc?.extraction||{}),documents:extractedDocuments,documentCount:extractedDocuments.length,sourceDocuments:extractedDocuments.map(d=>({id:d.id,filename:d.filename,mimeType:d.mimeType,documentType:d.extraction?.documentType||"unknown",confidence:d.extraction?.confidence||0})),agentMessages:[],extractionRunId:new Date().toISOString()}};
      let completedPack=buildValidatedPack(processed);
      completedPack=await runAutomatedEmailAudit(completedPack);
      setSelectedPack(completedPack);setLivePacks(prev=>prev.map(p=>p.id===completedPack.id?completedPack:p));
      const saved=await persistPack(completedPack);
      if(!saved)throw new Error("Database save failed after re-processing completed");
      await recordHistory(completedPack,"reprocessed","Pack reprocessed and extraction completed",null,{documentCount:extractedDocuments.length});
      notify("Re-processing complete — "+extractedDocuments.length+" documents extracted and validation completed");
    }catch(error){
      const message=error?.message||"Unknown re-processing error";
      const failed={...processing,status:"Needs review",processingError:message};
      setSelectedPack(failed);setLivePacks(prev=>prev.map(p=>p.id===failed.id?failed:p));
      await persistPack(failed);
      notify("Re-processing failed: "+message);
    }
  };

  const handleUpload=async(files)=>{const selected=Array.from(files||[]);if(!selected.length)return;setPendingUploadFiles(prev=>{const seen=new Set(prev.map(f=>f.name+"|"+f.size+"|"+f.lastModified));return [...prev,...selected.filter(f=>!seen.has(f.name+"|"+f.size+"|"+f.lastModified))]});setShowUploadConfirm(true);};
  const confirmUpload=async()=>{const selected=[...pendingUploadFiles];if(!selected.length)return;const highest=livePacks.reduce((max,p)=>Math.max(max,Number(String(p.id||"").replace("PK-",""))||0),10482),id=`PK-${highest+1}`,started=new Date().toISOString();let uploadedFiles;try{uploadedFiles=await Promise.all(selected.map(async(f,i)=>{const localId=`${id}-${i}`;await saveUploadedDocument(localId,f);const sr=await fetch("/api/storage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"upload-url",packId:id,filename:f.name,contentType:f.type})}),sd=await sr.json();if(!sr.ok)throw new Error(sd.error||"Could not create storage upload URL");const ur=await fetch(sd.signedUrl,{method:"PUT",headers:{"Content-Type":f.type||"application/octet-stream"},body:f});if(!ur.ok)throw new Error(`Could not upload ${f.name}`);return{id:localId,name:f.name,size:f.size,type:f.type,storagePath:sd.path};}));}catch(e){notify("Document storage upload failed: "+e.message);return;}const strategy=getCustomerStrategy(uploadCustomer),strategyApplied=uploadCustomer!=="Unassigned customer"&&Object.keys(strategy||{}).length>0,newPack={organisationId:DEFAULT_ORGANISATION.id,organisationName:DEFAULT_ORGANISATION.name,id,customer:uploadCustomer,docs:selected.length,status:"Processing",confidence:0,received:started,processingStartedAt:started,ticket:`UPLOAD-${Date.now().toString().slice(-5)}`,assignedTo:"Unassigned",uploadedFiles,email:null,title:selected[0]?.name||id,customerStrategyApplied:strategyApplied};setLivePacks(prev=>[newPack,...prev]);await persistPack(newPack);await recordHistory(newPack,"uploaded",`Uploaded ${selected.length} document${selected.length===1?"":"s"} and confirmed the document pack.`,null,{documents:selected.map(f=>f.name),customer:uploadCustomer,strategyApplied});setPendingUploadFiles([]);setShowUploadConfirm(false);setUploadCustomer("Unassigned customer");navigate("inbox");notify("Document pack confirmed — AI extraction started");try{const extractedDocuments=[];for(const u of uploadedFiles){let source=selected.find(f=>f.name===u.name&&f.size===u.size)||selected.find(f=>f.name===u.name);if(!source&&u.storagePath){const sr=await fetch("/api/storage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"signed-url",path:u.storagePath})}),sd=await sr.json();if(!sr.ok)throw new Error(sd.error||"Could not open "+u.name);source=await (await fetch(sd.signedUrl)).blob();}if(!source)throw new Error("Document "+u.name+" is unavailable");const bytes=new Uint8Array(await source.arrayBuffer());let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));const r=await fetch("/api/extract",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileData:`data:${source.type||u.type||"application/octet-stream"};base64,${btoa(binary)}`,filename:u.name,mimeType:source.type||u.type})}),d=await r.json();if(!r.ok)throw new Error(d.error||"Extraction failed for "+u.name);extractedDocuments.push({id:u.id,filename:u.name,mimeType:source.type||u.type,extraction:d.extraction});}const invoice=extractedDocuments.find(d=>d.extraction?.documentType==="commercial_invoice")||extractedDocuments[0],processed={...newPack,status:"Needs review",extractedData:{...(invoice?.extraction||{}),documents:extractedDocuments,documentCount:extractedDocuments.length,sourceDocuments:extractedDocuments.map(d=>({id:d.id,filename:d.filename,mimeType:d.mimeType,documentType:d.extraction?.documentType||"unknown",confidence:d.extraction?.confidence||0}))}};let completed=buildValidatedPack(processed);completed=await runAutomatedEmailAudit(completed);setLivePacks(prev=>prev.map(p=>p.id===id?completed:p));setSelectedPack(completed);await persistPack(completed);await recordHistory(completed,"extracted","Document Extraction Agent completed extraction",null,{documentCount:extractedDocuments.length},null,"agent","Document Extraction Agent");if(strategyApplied)await recordHistory(completed,"strategy_applied",`Applied customer strategy for ${uploadCustomer}`,null,{customer:uploadCustomer},null,"system","Customs IDP System");notify(extractedDocuments.length+" document"+(extractedDocuments.length===1?"":"s")+" extracted and validation completed");}catch(e){const failed={...newPack,status:"Needs review",processingError:e.message};setLivePacks(prev=>prev.map(p=>p.id===id?failed:p));setSelectedPack(failed);await persistPack(failed);await recordHistory(failed,"processing_error","Document processing failed",null,{error:e.message},null,"system","Customs IDP System");notify("Extraction failed — check the pack for details");}};
  const filteredPacks=useMemo(()=>livePacks.filter(p=>
    [p.id,p.customer,p.status,p.ticket].join(" ").toLowerCase().includes(query.toLowerCase())
  ),[livePacks,query]);

  const navigate=(p)=>{setPage(p);setMobileMenuOpen(false);};
  const notify=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),2500)};
  const recordHistory=async(pack,action,description,beforeData=null,afterData=null,metadata=null,actorType="user",actorName=null)=>{if(!pack?.id)return;try{await fetch("/api/history",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({packId:pack.id,action,description,beforeData,afterData,metadata,actorType,actorName})});}catch{}};
  const deletePack=async pack=>{if(!pack?.id||!window.confirm("Delete this pack? This will permanently remove the pack and its extracted customs data."))return;try{const r=await fetch("/api/packs?id="+encodeURIComponent(pack.id),{method:"DELETE",credentials:"include"}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Unable to delete pack");for(const f of pack.uploadedFiles||[])await deleteUploadedDocument(f.id);setLivePacks(prev=>prev.filter(p=>p.id!==pack.id));if(selectedPack?.id===pack.id){setSelectedPack(null);navigate("inbox");}notify("Pack deleted");}catch(e){notify(e.message||"Unable to delete pack");}};
  const assignPack=(packId,assignedTo)=>{const previous=livePacks.find(p=>p.id===packId),updated={...previous,assignedTo};setLivePacks(prev=>prev.map(p=>p.id===packId?updated:p));if(selectedPack?.id===packId)setSelectedPack(prev=>({...prev,assignedTo}));persistPack(updated);recordHistory(updated,"assigned",`Pack assigned to ${assignedTo}`,{assignedTo:previous?.assignedTo||"Unassigned"},{assignedTo});notify(`Pack ${packId} assigned to ${assignedTo}`)};
  const updatePack=(pack)=>{if(!pack)return;const next=pack.extractedData?.documents?{...pack,workingRecord:buildWorkingCustomsRecord(pack)}:pack;setSelectedPack(next);setLivePacks(prev=>prev.map(p=>p.id===next.id?next:p));persistPack(next);};
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
    await persistPack(validated);await recordHistory(validated,"validated",validated.validationStatus==="Validated"?"Pack validated successfully":"Pack validation completed with issues",null,{status:validated.status,validationStatus:validated.validationStatus,checks:validated.validationChecks});
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
  persistPack(posted);recordHistory(posted,"posted_to_lca","Pack posted to LCA",null,{postedToLCAAt:now});
  notify("Pack posted to LCA");
  navigate("inbox");
};

  if(passwordSetup)return <SupabasePasswordSetup onComplete={user=>{setPasswordSetup(false);setCurrentUser(user);setAuthenticated(true);setPage("inbox");}}/>;
  if(authenticated===null)return <div className="test-login"><div className="test-login-card"><div className="test-login-brand"><div className="brand-mark"><Zap size={18}/></div><div><strong>Customs IDP</strong><span>Intelligent Data Processing</span></div></div><div className="test-login-copy"><div className="eyebrow">Secure access</div><h1>Checking access…</h1><p>Please wait.</p></div></div></div>;
  if(!authenticated)return localTestRoute ? <LocalTestLogin onSuccess={user=>{setCurrentUser(user);setAuthenticated(true);setPage("inbox");}}/> : passwordSetup ? <SupabasePasswordSetup onComplete={user=>{setPasswordSetup(false);setCurrentUser(user);setAuthenticated(true);setPage("inbox");}}/> : <SupabaseLogin onSuccess={user=>{setCurrentUser(user);setAuthenticated(true);setPage("inbox");}}/>;
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
        {page==="review"&&<button className="back-to-inbox-btn" aria-label="Back to inbox" title="Back to inbox" onClick={()=>navigate("inbox")}><ChevronLeft size={16}/><span>Back to inbox</span></button>}
        <button className="mobile-menu-btn" aria-label="Open navigation" onClick={()=>setMobileMenuOpen(true)}><Menu size={20}/></button><div className="mobile-brand"><strong>Customs IDP</strong></div>
        {page!=="review"&&<div className="crumb"><span className="organisation-crumb">{DEFAULT_ORGANISATION.name}</span> <span>/</span> Operations <span>/</span> {page[0].toUpperCase()+page.slice(1)}</div>}
        <div className="top-actions"><button className="icon-btn" aria-label="Open inbox" onClick={()=>navigate("inbox")}><Mail size={18}/></button>{page==="review"&&selectedPack&&<div className="review-top-actions"><select className="owner-select review-owner" value={selectedPack.assignedTo||"Unassigned"} onChange={e=>assignPack(selectedPack.id,e.target.value)}><option>Unassigned</option><option>Liam Wingrove</option><option>Data Processor 1</option><option>Data Processor 2</option><option>Muhammad Amer</option></select><Status status={selectedPack.status}/><button className="secondary" onClick={()=>reprocessPack?.(selectedPack)}>Re-process</button><button className="secondary" onClick={validatePack}>Validate data</button><button className={selectedPack.status==="Ready"?"primary":"secondary"} onClick={postToLCA}>Post to LCA</button></div>}<div className="top-avatar" title={currentUserName}>{currentUserInitials}</div></div>
      </header>

      <input ref={uploadRef} className="hidden-upload" type="file" multiple accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.png,.jpg,.jpeg,.eml,.msg" onChange={e=>handleUpload(e.target.files)}/>
      <div className="content">
        {page==="manager" && canViewManager && <ManagerPage livePacks={livePacks} dataSource={dataSource}/>} 
        {page==="dashboard" && <Dashboard navigate={navigate} notify={notify} livePacks={livePacks}/>}
        {page==="inbox" && <InboxPage packs={filteredPacks} query={query} setQuery={setQuery} openPack={(p)=>{if(p?.status==="Processing"){notify("This pack is still processing. It will become available when extraction completes.");return;}setSelectedPack(p);navigate("review")}} onUpload={handleUpload} onAssign={assignPack} onDelete={deletePack} emailSyncStatus={emailSyncStatus} currentUserKey={currentUser?.id||currentUserName}/>}
        
        {page==="review" && (selectedPack?.status==="Processing" ? <ProcessingReviewGuard onBack={()=>navigate("inbox")}/> : <Review pack={selectedPack ? {...selectedPack, workingRecord:selectedPack.workingRecord||buildWorkingCustomsRecord(selectedPack)} : selectedPack} currentUserName={currentUserName} back={()=>navigate("inbox")} notify={notify} onAssign={assignPack} updatePack={updatePack} validatePack={validatePack} postToLCA={postToLCA} reprocessPack={reprocessPack} persistValidatedPack={persistValidatedPack} recordHistory={recordHistory}/>)}
        {page==="customers" && <Customers notify={notify}/>}
        {page==="agent" && <AgentPage/>}
        {page==="settings" && <SettingsPage/>}
      </div>
    </main>

    {agentOpen && page!=="agent" && page!=="review" && <button className="agent-fab" onClick={()=>navigate("agent")}><Sparkles size={18}/> AI Agent</button>}
    {showUploadConfirm&&<UploadConfirmModal files={pendingUploadFiles} setFiles={setPendingUploadFiles} customer={uploadCustomer} setCustomer={setUploadCustomer} customers={Object.keys(customerStrategyStore)} getStrategy={getCustomerStrategy} onAddFiles={handleUpload} onCancel={()=>{setPendingUploadFiles([]);setShowUploadConfirm(false)}} onConfirm={confirmUpload}/>}\n    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
  </div>
}

createRoot(document.getElementById("root")).render(<App/>);
// Vercel redeploy trigger after connection reset 2026-09-18T20:26:46.067Z

