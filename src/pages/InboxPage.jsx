import React from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import { PackTable } from "../components/SharedComponents.jsx";

function InboxPage({packs,query,setQuery,openPack,title="Inbox",onUpload,onAssign,emailSyncStatus,packLoadError}){
 return <section><div className="page-head"><div><div className="eyebrow">Document processing</div><h1>{title}</h1><p>Review incoming document packs, extraction confidence and validation status.</p></div><button className="primary" onClick={()=>document.querySelector(".hidden-upload")?.click()}><Plus size={17}/> Upload documents</button></div>
 <div className={"email-sync-debug "+(emailSyncStatus?.state==="error"?"error":"")}><strong>Outlook intake</strong><span>{emailSyncStatus?.state==="error" ? ("Recovery scan error: "+emailSyncStatus.error) : emailSyncStatus?.message || (emailSyncStatus?.state==="syncing" ? "Running secondary recovery scan…" : emailSyncStatus?.state==="ready" ? (emailSyncStatus.checked+" matching · "+emailSyncStatus.processed+" processed · "+emailSyncStatus.duplicates+" duplicate · "+emailSyncStatus.failed+" failed") : "Webhook intake active")}</span></div>
 {packLoadError&&<div className="email-sync-debug error"><strong>Inbox database</strong><span>{packLoadError}</span></div>}
 <div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search packs, customers or tickets..."/></div><button className="filter">Status <ChevronDown size={15}/></button><button className="filter">Customer <ChevronDown size={15}/></button></div>
 <div className="panel"><PackTable packs={packs} onOpen={openPack} onAssign={onAssign}/></div></section>
}



export { InboxPage };

