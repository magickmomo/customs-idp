"use client";
import React, { useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, ArrowRight, Bot, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FileText,
  Inbox, Mail, Menu, MoreHorizontal, Package, Plus, Search,
  Settings, ShieldCheck, Sparkles, Users, X, Zap
} from "lucide-react";
import { DEFAULT_ORGANISATION } from "./tenant.js";
import { supabase } from "./lib/supabase.js";
import { customerStrategyStore, getCustomerStrategy, packs } from "./domain/packData.js";
import { Review } from "./components/pages/Pages.jsx";
import { AgentPage } from "./components/pages/AgentPage.jsx";
import { Customers } from "./components/pages/CustomersPage.jsx";
import { SettingsPage } from "./components/pages/SettingsPage.jsx";
import { Dashboard, ManagerPage } from "./components/pages/DashboardPages.jsx";
import { InboxPage } from "./components/pages/InboxPage.jsx";
import { NavItem, Status } from "./components/SharedComponents.jsx";
import { useAuthSession } from "./hooks/useAuthSession.js";
import { usePackWorkspace } from "./hooks/usePackWorkspace.js";
import { LocalTestLogin, SupabaseLogin, SupabasePasswordSetup } from "./components/pages/AuthPages.jsx";
import { UploadConfirmModal } from "./components/UploadConfirmModal.jsx";
import { ProcessingReviewGuard } from "./components/ProcessingReviewGuard.jsx";
import { usePackActions } from "./hooks/usePackActions.js";

function App(){
  const localTestRoute=process.env.NODE_ENV !== "production"&&typeof window!=="undefined"&&window.location.pathname==="/test-auth";
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
  const navigate=(p)=>{setPage(p);setMobileMenuOpen(false);};
  const notify=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),2500)};
  const recordHistory=async(pack,action,description,beforeData=null,afterData=null,metadata=null,actorType="user",actorName=null)=>{if(!pack?.id)return;try{await fetch("/api/history",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({packId:pack.id,action,description,beforeData,afterData,metadata,actorType,actorName})});}catch{}};

  const {
    pendingUploadFiles,
    setPendingUploadFiles,
    uploadCustomer,
    setUploadCustomer,
    showUploadConfirm,
    setShowUploadConfirm,
    handleUpload,
    confirmUpload,
    reprocessPack,
    deletePack,
    assignPack,
    updatePack,
    persistValidatedPack,
    validatePack,
    postToLCA
  } = usePackActions({
    currentUserName,
    livePacks,
    setLivePacks,
    selectedPack,
    setSelectedPack,
    persistPack,
    navigate,
    notify,
    recordHistory
  });

  const filteredPacks=useMemo(()=>livePacks.filter(p=>
    [p.id,p.customer,p.status,p.ticket].join(" ").toLowerCase().includes(query.toLowerCase())
  ),[livePacks,query]);

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
        <div className="top-actions">{page==="review"&&selectedPack&&<div className="review-top-actions"><Status status={selectedPack.status}/><select className="owner-select review-owner" value={selectedPack.assignedTo||"Unassigned"} onChange={e=>assignPack(selectedPack.id,e.target.value)}><option>Unassigned</option><option>Liam Wingrove</option><option>Data Processor 1</option><option>Data Processor 2</option><option>Muhammad Amer</option></select><button className="secondary" onClick={()=>reprocessPack?.(selectedPack)}>Re-process</button><button className="secondary" onClick={validatePack}>Validate data</button><button className={selectedPack.status==="Ready"?"primary":"secondary"} onClick={postToLCA}>Post to LCA</button></div>}<div className="top-avatar" title={currentUserName}>{currentUserInitials}</div></div>
      </header>

      <input ref={uploadRef} className="hidden-upload" type="file" multiple accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.png,.jpg,.jpeg,.eml,.msg" onChange={e=>handleUpload(e.target.files)}/>
      <div className="content">
        {page==="manager" && canViewManager && <ManagerPage livePacks={livePacks} dataSource={dataSource}/>} 
        {page==="dashboard" && <Dashboard navigate={navigate} notify={notify} livePacks={livePacks}/>}
        {page==="inbox" && <InboxPage key={currentUser?.id||currentUserName} packs={filteredPacks} query={query} setQuery={setQuery} openPack={(p)=>{if(p?.status==="Processing"){notify("This pack is still processing. It will become available when extraction completes.");return;}setSelectedPack(p);navigate("review")}} onUpload={handleUpload} onAssign={assignPack} onDelete={deletePack} emailSyncStatus={emailSyncStatus} currentUserKey={currentUser?.id||currentUserName}/>}
        
        {page==="review" && (selectedPack?.status==="Processing" ? <ProcessingReviewGuard onBack={()=>navigate("inbox")}/> : <Review pack={selectedPack ? {...selectedPack, workingRecord:selectedPack.workingRecord} : selectedPack} currentUserName={currentUserName} back={()=>navigate("inbox")} notify={notify} onAssign={assignPack} updatePack={updatePack} validatePack={validatePack} postToLCA={postToLCA} reprocessPack={reprocessPack} persistPack={persistPack} persistValidatedPack={persistValidatedPack} recordHistory={recordHistory}/>)}
        {page==="customers" && <Customers notify={notify}/>}
        {page==="agent" && <AgentPage/>}
        {page==="settings" && <SettingsPage currentUserRole={currentUserRole}/>}
      </div>
    </main>

    {agentOpen && page!=="agent" && page!=="review" && <button className="agent-fab" onClick={()=>navigate("agent")}><Sparkles size={18}/> AI Agent</button>}
    {showUploadConfirm&&<UploadConfirmModal files={pendingUploadFiles} setFiles={setPendingUploadFiles} customer={uploadCustomer} setCustomer={setUploadCustomer} customers={Object.keys(customerStrategyStore)} getStrategy={getCustomerStrategy} onAddFiles={handleUpload} onCancel={()=>{setPendingUploadFiles([]);setShowUploadConfirm(false)}} onConfirm={confirmUpload}/>}\n    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
  </div>
}

export default App;
