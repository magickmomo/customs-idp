import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, SlidersHorizontal } from "lucide-react";
import { PackTable } from "../components/SharedComponents.jsx";
import { DEFAULT_INBOX_COLUMNS, DEFAULT_INBOX_COLUMN_KEYS, normaliseInboxColumnSelection } from "../domain/packData.js";

const INBOX_COLUMNS_STORAGE_KEY="customs-idp-inbox-columns";
const INBOX_COLUMNS_STORAGE_VERSION=2;
const columnStorageKey=userKey=>INBOX_COLUMNS_STORAGE_KEY+":"+(String(userKey||"default").trim()||"default");

function loadInboxColumns(storageKey){
  try{
    const saved=normaliseInboxColumnSelection(JSON.parse(localStorage.getItem(storageKey)||"null"));
    const version=Number(localStorage.getItem(storageKey+":version")||1);
    if(version<INBOX_COLUMNS_STORAGE_VERSION){
      const migrated=[...saved];
      if(migrated.includes("pack")&&!migrated.includes("packId"))migrated.splice(migrated.indexOf("pack")+1,0,"packId");
      return migrated;
    }
    return saved;
  }
  catch{return [...DEFAULT_INBOX_COLUMN_KEYS];}
}

function InboxPage({packs,query,setQuery,openPack,title="Inbox",onAssign,onDelete,emailSyncStatus,packLoadError,currentUserKey}){
 const storageKey=columnStorageKey(currentUserKey);
 const [columns,setColumns]=useState(()=>loadInboxColumns(storageKey));
 const [columnMenuOpen,setColumnMenuOpen]=useState(false);
 const columnPickerRef=useRef(null);

 useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(columns));localStorage.setItem(storageKey+":version",String(INBOX_COLUMNS_STORAGE_VERSION));}catch{}},[columns,storageKey]);
 useEffect(()=>{
   if(!columnMenuOpen)return undefined;
   const closeOnOutsideClick=event=>{if(!columnPickerRef.current?.contains(event.target))setColumnMenuOpen(false);};
   const closeOnEscape=event=>{if(event.key==="Escape")setColumnMenuOpen(false);};
   document.addEventListener("pointerdown",closeOnOutsideClick);
   document.addEventListener("keydown",closeOnEscape);
   return()=>{document.removeEventListener("pointerdown",closeOnOutsideClick);document.removeEventListener("keydown",closeOnEscape);};
 },[columnMenuOpen]);

 const toggleColumn=key=>setColumns(current=>{
   if(current.includes(key))return current.length===1?current:current.filter(column=>column!==key);
   return [...current,key];
 });
 const resetColumns=()=>setColumns([...DEFAULT_INBOX_COLUMN_KEYS]);

 return <section><div className="page-head"><div><div className="eyebrow">Document processing</div><h1>{title}</h1><p>Review incoming document packs, extraction confidence and validation status.</p></div><button className="primary" onClick={()=>document.querySelector(".hidden-upload")?.click()}><Plus size={17}/> Upload documents</button></div>
 <div className={"email-sync-debug "+(emailSyncStatus?.state==="error"?"error":"")}><strong>Outlook intake</strong><span>{emailSyncStatus?.state==="error" ? ("Recovery scan error: "+emailSyncStatus.error) : emailSyncStatus?.message || (emailSyncStatus?.state==="syncing" ? "Running secondary recovery scan…" : emailSyncStatus?.state==="ready" ? (emailSyncStatus.checked+" matching · "+emailSyncStatus.processed+" processed · "+emailSyncStatus.duplicates+" duplicate · "+emailSyncStatus.failed+" failed") : "Webhook intake active")}</span></div>
 {packLoadError&&<div className="email-sync-debug error"><strong>Inbox database</strong><span>{packLoadError}</span></div>}
 <div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search packs, customers or tickets..."/></div><button className="filter">Status <ChevronDown size={15}/></button><button className="filter">Customer <ChevronDown size={15}/></button><div className="column-picker" ref={columnPickerRef}><button className="filter" type="button" aria-expanded={columnMenuOpen} onClick={()=>setColumnMenuOpen(open=>!open)}><SlidersHorizontal size={15}/> Columns <ChevronDown size={15}/></button>{columnMenuOpen&&<div className="column-menu"><div className="column-menu-head"><b>Inbox columns</b><button type="button" className="text-btn" onClick={resetColumns}>Reset</button></div><p>Choose which columns appear in the inbox.</p>{DEFAULT_INBOX_COLUMNS.map(column=>{const selected=columns.includes(column.key),lastSelected=selected&&columns.length===1;return <label key={column.key} className={"column-menu-item "+(lastSelected?"disabled":"")}><input type="checkbox" checked={selected} disabled={lastSelected} onChange={()=>toggleColumn(column.key)}/><span>{column.label}</span>{selected&&<Check size={15}/>}</label>})}</div>}</div></div>
 <div className="panel"><PackTable packs={packs} onOpen={openPack} onAssign={onAssign} onDelete={onDelete} columns={columns}/></div></section>
}

export { InboxPage };
