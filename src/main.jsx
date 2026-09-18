import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, AlertCircle, ArrowRight, Bot, CheckCircle2, ChevronDown, FileText,
  Inbox, LayoutDashboard, Mail, Menu, MoreHorizontal, Package, Plus, Search,
  Settings, ShieldCheck, Sparkles, Users, X, Zap
} from "lucide-react";
import "./styles.css";

const packs = [
  { id:"PK-10482", customer:"Acme Components Ltd", docs:4, status:"Needs review", confidence:91, received:"16 Sep 2026, 15:42", ticket:"TK-88421" },
  { id:"PK-10481", customer:"Northstar Manufacturing", docs:7, status:"Processing", confidence:96, received:"16 Sep 2026, 15:38", ticket:"TK-88420" },
  { id:"PK-10480", customer:"Bancale Trading", docs:3, status:"Validated", confidence:98, received:"16 Sep 2026, 15:31", ticket:"TK-88419" },
  { id:"PK-10479", customer:"Raven Industrial", docs:5, status:"Needs review", confidence:88, received:"16 Sep 2026, 15:12", ticket:"TK-88418" }
];

const customers = [
  {name:"Acme Components Ltd", code:"ACME-001", mailbox:"customs.acme@inbox.example", rules:12, processed:"2,481"},
  {name:"Northstar Manufacturing", code:"NSTM-014", mailbox:"customs.northstar@inbox.example", rules:8, processed:"1,972"},
  {name:"Bancale Trading", code:"BANC-007", mailbox:"customs.bancale@inbox.example", rules:15, processed:"3,108"},
  {name:"Raven Industrial", code:"RAVN-021", mailbox:"customs.raven@inbox.example", rules:6, processed:"1,406"}
];

const sampleLines = [
  {line:1,description:"Oak wooden packaging boxes",hs:"4415 10 00",origin:"HU",qty:24,net:"10.080",gross:"11.420",value:"384.00",confidence:97},
  {line:2,description:"Bancale Legno pallets",hs:"4415 20 90",origin:"IT",qty:6,net:"0.000",gross:"3.180",value:"120.00",confidence:93},
  {line:3,description:"Protective timber spacers",hs:"4415 10 90",origin:"HU",qty:18,net:"7.560",gross:"8.410",value:"216.00",confidence:94}
];

function App(){
  const [page,setPage]=useState("dashboard");
  const [selectedPack,setSelectedPack]=useState(packs[0]);
  const [agentOpen,setAgentOpen]=useState(true);
  const [query,setQuery]=useState("");
  const [toast,setToast]=useState("");
  const [livePacks,setLivePacks]=useState(packs);
  const uploadRef=useRef(null);

  const handleUpload=(files)=>{
    const selected=Array.from(files||[]);
    if(!selected.length) return;
    const id=`PK-${10483+livePacks.length}`;
    const newPack={id,customer:"Unassigned customer",docs:selected.length,status:"Processing",confidence:0,received:"Just now",ticket:`UPLOAD-${Date.now().toString().slice(-5)}`,uploadedFiles:selected.map(f=>({name:f.name,size:f.size,type:f.type}))};
    setLivePacks(prev=>[newPack,...prev]);
    notify(`${selected.length} document${selected.length===1?"":"s"} uploaded — pack ${id} created`);
    navigate("review");
    setSelectedPack(newPack);
  };

  const filteredPacks=useMemo(()=>livePacks.filter(p=>
    [p.id,p.customer,p.status,p.ticket].join(" ").toLowerCase().includes(query.toLowerCase())
  ),[query]);

  const navigate=(p)=>setPage(p);
  const notify=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),2500)};

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Zap size={18}/></div><div><strong>Customs IDP</strong><span>Intelligent Data Processing</span></div></div>
      <div className="workspace"><div className="avatar">LW</div><div><b>Customs Operations</b><span>Production</span></div><ChevronDown size={15}/></div>
      <nav>
        <NavItem icon={LayoutDashboard} label="Dashboard" active={page==="dashboard"} onClick={()=>navigate("dashboard")}/>
        <NavItem icon={Inbox} label="Inbox" badge="4" active={page==="inbox"} onClick={()=>navigate("inbox")}/>
        <NavItem icon={Package} label="Packs" active={page==="packs"} onClick={()=>navigate("packs")}/>
        <NavItem icon={Users} label="Customers" active={page==="customers"} onClick={()=>navigate("customers")}/>
        <NavItem icon={Bot} label="AI Agent" active={page==="agent"} onClick={()=>navigate("agent")}/>
      </nav>
      <div className="side-bottom">
        <NavItem icon={Settings} label="Settings" active={page==="settings"} onClick={()=>navigate("settings")}/>
        <div className="system-status"><span className="dot"></span><div><b>All systems operational</b><span>Last sync 16:02</span></div></div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div className="mobile-brand"><Menu size={20}/><strong>Customs IDP</strong></div>
        <div className="crumb">Operations <span>/</span> {page[0].toUpperCase()+page.slice(1)}</div>
        <div className="top-actions"><button className="icon-btn"><Mail size={18}/></button><div className="top-avatar">LW</div></div>
      </header>

      <input ref={uploadRef} className="hidden-upload" type="file" multiple accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.png,.jpg,.jpeg,.eml,.msg" onChange={e=>handleUpload(e.target.files)}/>
      <div className="content">
        {page==="dashboard" && <Dashboard navigate={navigate} notify={notify}/>}
        {page==="inbox" && <InboxPage packs={filteredPacks} query={query} setQuery={setQuery} openPack={(p)=>{setSelectedPack(p);navigate("review")}} onUpload={handleUpload}/>}
        {page==="packs" && <InboxPage packs={filteredPacks} query={query} setQuery={setQuery} openPack={(p)=>{setSelectedPack(p);navigate("review")}} title="Packs" onUpload={handleUpload}/>}
        {page==="review" && <Review pack={selectedPack} back={()=>navigate("inbox")} notify={notify}/>}
        {page==="customers" && <Customers notify={notify}/>}
        {page==="agent" && <AgentPage/>}
        {page==="settings" && <SettingsPage/>}
      </div>
    </main>

    {agentOpen && page!=="agent" && <button className="agent-fab" onClick={()=>navigate("agent")}><Sparkles size={18}/> AI Agent</button>}
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
  </div>
}

function NavItem({icon:Icon,label,badge,active,onClick}){return <button className={"nav-item "+(active?"active":"")} onClick={onClick}><Icon size={18}/><span>{label}</span>{badge&&<em>{badge}</em>}</button>}

function Dashboard({navigate,notify}){
 return <section>
  <div className="page-head"><div><div className="eyebrow">Wednesday, 16 September 2026</div><h1>Good afternoon, Liam</h1><p>Here's what's happening across your customs document operation.</p></div><button className="primary" onClick={()=>navigate("inbox")}><Inbox size={17}/> Open inbox</button></div>
  <div className="metric-grid">
    <Metric label="Packs today" value="184" delta="+12.4%" icon={Package}/>
    <Metric label="Invoices processed" value="642" delta="+8.7%" icon={FileText}/>
    <Metric label="Auto-validated" value="96.8%" delta="+1.9%" icon={ShieldCheck}/>
    <Metric label="Needs review" value="7" delta="-3 today" icon={AlertCircle} warning/>
  </div>
  <div className="dashboard-grid">
    <div className="panel"><div className="panel-head"><div><h2>Processing activity</h2><p>Documents processed over the last 7 days</p></div><button className="select">Last 7 days <ChevronDown size={14}/></button></div><div className="chart"><div className="chart-y"><span>800</span><span>600</span><span>400</span><span>200</span><span>0</span></div><div className="bars">{[58,72,65,84,76,91,96].map((h,i)=><div className="bar-col" key={i}><div className="bar" style={{height:h+"%"}}></div><span>{["Thu","Fri","Sat","Sun","Mon","Tue","Wed"][i]}</span></div>)}</div></div></div>
    <div className="panel"><div className="panel-head"><div><h2>Queue health</h2><p>Current pack status</p></div></div><div className="queue-list"><Queue label="Validated" value="171" pct="92.9" cls="good"/><Queue label="Processing" value="6" pct="3.3" cls="blue"/><Queue label="Needs review" value="7" pct="3.8" cls="warn"/></div><button className="text-btn" onClick={()=>navigate("inbox")}>View all packs <ArrowRight size={15}/></button></div>
  </div>
  <div className="panel recent"><div className="panel-head"><div><h2>Recent packs</h2><p>Latest documents entering the operation</p></div><button className="text-btn" onClick={()=>navigate("inbox")}>View inbox <ArrowRight size={15}/></button></div><PackTable packs={packs.slice(0,4)} onOpen={(p)=>navigate("inbox")}/></div>
 </section>
}

function Metric({label,value,delta,icon:Icon,warning}){return <div className="metric"><div className={"metric-icon "+(warning?"warning":"")}><Icon size={19}/></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small className={delta.startsWith("-")?"positive":""}>{delta}</small></div></div>}
function Queue({label,value,pct,cls}){return <div className="queue"><div><span className={"queue-dot "+cls}></span><b>{label}</b><strong>{value}</strong></div><div className="progress"><i className={cls} style={{width:pct+"%"}}></i></div><small>{pct}%</small></div>}

function InboxPage({packs,query,setQuery,openPack,title="Inbox",onUpload}){
 return <section><div className="page-head"><div><div className="eyebrow">Document processing</div><h1>{title}</h1><p>Review incoming document packs, extraction confidence and validation status.</p></div><button className="primary" onClick={onUpload}><Plus size={17}/> Upload documents</button></div>
 <div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search packs, customers or tickets..."/></div><button className="filter">Status <ChevronDown size={15}/></button><button className="filter">Customer <ChevronDown size={15}/></button></div>
 <div className="panel"><PackTable packs={packs} onOpen={openPack}/></div></section>
}

function PackTable({packs,onOpen}){return <div className="table-wrap"><table><thead><tr><th>PACK</th><th>CUSTOMER</th><th>DOCUMENTS</th><th>STATUS</th><th>CONFIDENCE</th><th>RECEIVED</th><th></th></tr></thead><tbody>{packs.map(p=><tr key={p.id} onClick={()=>onOpen(p)}><td><b>{p.id}</b><small>{p.ticket}</small></td><td>{p.customer}</td><td>{p.docs} documents</td><td><Status status={p.status}/></td><td><div className="confidence"><span>{p.confidence}%</span><div><i style={{width:p.confidence+"%"}}></i></div></div></td><td>{p.received}</td><td><button className="row-btn"><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table></div>}

function Status({status}){let c=status==="Validated"?"good":status==="Processing"?"processing":"review";return <span className={"status "+c}><span></span>{status}</span>}

function Review({pack,back,notify}){
 const [tab,setTab]=useState("extraction");
 const [chat,setChat]=useState("");
 return <section><button className="back" onClick={back}>← Back to inbox</button><div className="review-head"><div><div className="eyebrow">{pack.id} · {pack.ticket}</div><h1>{pack.customer}</h1><p>{pack.docs} documents · received {pack.received}</p></div><div className="review-actions"><Status status={pack.status}/><button className="secondary" onClick={()=>notify("Pack marked as validated")}>Approve pack</button></div></div>
 <div className="review-layout"><div className="panel extraction-panel"><div className="tabs"><button className={tab==="extraction"?"selected":""} onClick={()=>setTab("extraction")}>Extracted data</button><button className={tab==="documents"?"selected":""} onClick={()=>setTab("documents")}>Documents ({pack.docs})</button><button className={tab==="json"?"selected":""} onClick={()=>setTab("json")}>Middleware JSON</button></div>{tab==="extraction"&&<><div className="data-summary"><div><span>Invoice total</span><b>£720.00</b></div><div><span>Gross mass</span><b>23.01 kg</b></div><div><span>Country export</span><b>HU</b></div><div><span>Delivery term</span><b>DDP · Maldon</b></div></div><div className="section-title"><div><h3>Invoice positions</h3><span>3 lines extracted · click a value to edit</span></div><button className="secondary" onClick={()=>notify("Extraction rule saved for this customer")}>Save corrections</button></div><div className="line-table"><table><thead><tr><th>#</th><th>DESCRIPTION</th><th>HS CODE</th><th>ORIGIN</th><th>QTY</th><th>NET KG</th><th>GROSS KG</th><th>VALUE</th><th></th></tr></thead><tbody>{sampleLines.map(l=><tr key={l.line}><td>{l.line}</td><td><b>{l.description}</b><small>{l.confidence}% confidence</small></td><td>{l.hs}</td><td><span className="country">{l.origin}</span></td><td>{l.qty}</td><td>{l.net}</td><td>{l.gross}</td><td>£{l.value}</td><td><MoreHorizontal size={16}/></td></tr>)}</tbody></table></div></>}{tab==="documents"&&<div className="doc-list">{(pack.uploadedFiles?.length?pack.uploadedFiles.map(f=>f.name):["Commercial Invoice 88421.pdf","Packing List 88421.pdf","Certificate of Origin.pdf","Transport Document.pdf"]).map((d,i)=><div className="doc-row" key={d}><FileText size={20}/><div><b>{d}</b><span>{pack.uploadedFiles?.length?"Uploaded · awaiting extraction":"Extracted · 97% confidence"}</span></div><button className="secondary" onClick={()=>notify(`Document selected: ${d}`)}>Open</button></div>)}</div>}{tab==="json"&&<pre className="json">{"{\n  \"customerId\": \"ACME-001\",\n  \"identifier\": \"PK-10482\",\n  \"customerReference\": \"88421\",\n  \"customerCustomerNo\": \"ACME-UK\",\n  \"deliveryTerm_SAD20\": \"DDP\",\n  \"deliveryTermPlace_SAD20\": \"Maldon\",\n  \"countryOfExport_SAD15\": \"HU\",\n  \"countryOfDestination_SAD17\": \"GB\",\n  \"totalAmountInvoiced_SAD22\": 720.00,\n  \"totalAmountInvoicedCurrency_SAD22\": \"GBP\",\n  \"totalGrossMass\": 23.01,\n  \"ticketNo\": \"TK-88421\",\n  \"positions\": [...]\n}"}</pre>}</div>
 <aside className="agent-panel"><div className="agent-title"><div className="agent-orb"><Sparkles size={18}/></div><div><b>Extraction Agent</b><span>Online · customer-aware</span></div></div><div className="agent-insight"><Sparkles size={15}/><div><b>Validation complete</b><p>I found 1 field that may need review: the gross mass was apportioned across the three lines using the configured net-weight ratio.</p></div></div><div className="agent-rule"><span>Applied customer rule</span><b>Gross weight apportionment</b><small>Net-weight ratio · Bancale Legno excluded from net weight</small></div><div className="chat"><div className="message agent">I can correct extracted fields, explain why a value was chosen, or save a correction as a customer rule.</div><div className="chat-input"><input value={chat} onChange={e=>setChat(e.target.value)} placeholder="Ask the agent to change something..."/><button onClick={()=>{setChat("");notify("Agent request queued")}}><ArrowRight size={16}/></button></div></div></aside></div></section>
}

function Customers({notify}){return <section><div className="page-head"><div><div className="eyebrow">Configuration</div><h1>Customers</h1><p>Customer-specific extraction strategies, mailboxes and validation rules.</p></div><button className="primary" onClick={()=>notify("Customer creation flow opened")}><Plus size={17}/> Add customer</button></div><div className="customer-grid">{customers.map(c=><div className="customer-card" key={c.code}><div className="customer-top"><div className="customer-logo">{c.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div><button className="row-btn"><MoreHorizontal size={17}/></button></div><h3>{c.name}</h3><span className="code">{c.code}</span><div className="customer-info"><div><Mail size={15}/><span>{c.mailbox}</span></div><div><Settings size={15}/><span>{c.rules} extraction rules</span></div><div><Activity size={15}/><span>{c.processed} documents processed</span></div></div><button className="full-btn">Open strategy <ArrowRight size={15}/></button></div>)}</div></section>}

function AgentPage(){return <section><div className="page-head"><div><div className="eyebrow">Automation & intelligence</div><h1>AI Agent</h1><p>Explain extraction decisions, validate customs data and maintain customer-specific rules.</p></div><span className="online-pill"><span></span> Online</span></div><div className="agent-page-grid"><div className="panel"><div className="panel-head"><div><h2>Agent capabilities</h2><p>Available actions in the current workflow</p></div></div>{["Explain why a field was extracted","Correct an extracted value","Create or update a customer rule","Validate middleware fields and ISO codes","Apply weight apportionment rules","Flag low-confidence customs data"].map((x,i)=><div className="capability" key={x}><div className="cap-icon"><Sparkles size={15}/></div><span>{x}</span><CheckCircle2 size={16}/></div>)}</div><div className="panel chat-large"><div className="agent-title"><div className="agent-orb"><Sparkles size={18}/></div><div><b>Customs IDP Agent</b><span>Ready to analyse your documents</span></div></div><div className="chat-history"><div className="message agent">Hi Liam. I can inspect an extraction, explain the validation logic, or update a customer's strategy. Try: “Why did you use HU for line 1?”</div><div className="suggestions"><button>Why was the gross weight apportioned?</button><button>Show Acme's active rules</button><button>Validate this pack for middleware</button></div></div><div className="chat-input"><input placeholder="Ask the agent anything about this operation..."/><button><ArrowRight size={16}/></button></div></div></div></section>}

function SettingsPage(){return <section><div className="page-head"><div><div className="eyebrow">Platform</div><h1>Settings</h1><p>Core processing, middleware and integration configuration.</p></div></div><div className="settings-grid"><div className="panel settings-card"><h2>Middleware</h2><p>Configure the output contract used by the downstream customs system.</p><label>Endpoint</label><input value="https://middleware.internal/customs/orders" readOnly/><label>Format</label><select><option>JSON</option></select><label>Destination</label><input value="ASM UK" readOnly/></div><div className="panel settings-card"><h2>Processing defaults</h2><p>Global fallbacks used when a customer has no overriding rule.</p><Toggle label="Automatic validation" on/><Toggle label="Low-confidence review queue" on/><Toggle label="Auto-send validated packs" on/></div></div></section>}

function Toggle({label,on}){return <div className="toggle-row"><span>{label}</span><div className={"toggle "+(on?"on":"")}><i></i></div></div>}

createRoot(document.getElementById("root")).render(<App/>);