import React, { useEffect, useState } from "react";
import { Activity, ArrowRight, Mail, MoreHorizontal, Plus, Settings } from "lucide-react";

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



export { Customers };
