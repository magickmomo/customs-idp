import React, { useState } from "react";
import { Activity, AlertCircle, ArrowRight, FileText, Package, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Metric, PackTable, Queue } from "../SharedComponents.jsx";

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
 const avgConfidence=totalPacks?Math.round(filtered.reduce((n,p)=>n+(Number(p.confidence)||0),0)/totalPacks):0;
 const validated=filtered.filter(p=>p.status==="Ready"||p.status==="Validated"||p.status==="Posted to LCA").length;
 const review=filtered.filter(p=>p.status==="Needs review").length;
 const processing=filtered.filter(p=>p.status==="Processing").length;
 const failed=filtered.filter(p=>p.status==="Failed"||p.status==="failed").length;
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
   return {name,role:name==="Liam Wingrove"||name==="Muhammad Amer"?"Manager":"Data Processor",packs:rows.length,docs,reviews,validated:validatedBy,avgProcessingTime};
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
    <div className="manager-table-wrap"><table><thead><tr><th>TEAM MEMBER</th><th>ROLE</th><th>PACKS</th><th>DOCUMENTS</th><th>VALIDATED</th><th>REVIEWS</th><th>AVG PROCESSING</th></tr></thead><tbody>{team.map(m=><tr key={m.name}><td><b>{m.name}</b></td><td>{m.role}</td><td>{m.packs}</td><td>{m.docs}</td><td>{m.validated}</td><td>{m.reviews}</td><td>{m.avgProcessingTime}</td></tr>)}</tbody></table></div>
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




export { Dashboard, ManagerPage };
