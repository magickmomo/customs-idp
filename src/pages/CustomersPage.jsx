import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Mail,
  MoreHorizontal,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { customerStrategyStore } from "../domain/packData.js";

const SETUP_SECTIONS=[
  {id:"details",label:"Details",icon:Settings},
  {id:"strategy",label:"Strategy",icon:ShieldCheck},
  {id:"knowledge",label:"Agent Knowledge",icon:BookOpen},
  {id:"mailbox",label:"Mailbox",icon:Mail},
  {id:"memory",label:"Memory",icon:Sparkles}
];

const DEFAULT_STRATEGY={
  emailFields:[],
  validationRules:[],
  extractionRules:[],
  requiredFields:[],
  fieldRules:[],
  customValidations:[],
  autoApplyWeightApportionment:false
};

function cloneStrategy(strategy){
  return {
    ...DEFAULT_STRATEGY,
    ...(strategy||{}),
    emailFields:Array.isArray(strategy?.emailFields)?[...strategy.emailFields]:[],
    validationRules:Array.isArray(strategy?.validationRules)?[...strategy.validationRules]:[],
    extractionRules:Array.isArray(strategy?.extractionRules)?[...strategy.extractionRules]:[],
    requiredFields:Array.isArray(strategy?.requiredFields)?[...strategy.requiredFields]:[],
    fieldRules:Array.isArray(strategy?.fieldRules)?[...strategy.fieldRules]:[],
    customValidations:Array.isArray(strategy?.customValidations)?[...strategy.customValidations]:[],
    autoApplyWeightApportionment:strategy?.autoApplyWeightApportionment===true
  };
}

function Customers({notify}){
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [organisation,setOrganisation]=useState(null);
  const [teamCount,setTeamCount]=useState(0);
  const [teams,setTeams]=useState([]);
  const [customerRows,setCustomerRows]=useState([]);

  const [selectedCustomer,setSelectedCustomer]=useState(null);
  const [setupSection,setSetupSection]=useState("details");

  const [form,setForm]=useState({
    name:"",
    code:"",
    teamId:""
  });

  const [strategy,setStrategy]=useState(cloneStrategy());
  const [saving,setSaving]=useState(false);
  const [setupError,setSetupError]=useState("");
  const [saved,setSaved]=useState(false);

  const [showCreate,setShowCreate]=useState(false);
  const [creating,setCreating]=useState(false);
  const [createForm,setCreateForm]=useState({
    name:"",
    code:"",
    teamId:""
  });
  const [formError,setFormError]=useState("");

  const loadCustomers=async()=>{
    setLoading(true);
    setError("");

    try{
      const response=await fetch(
        "/api/organisation?action=customers",
        {credentials:"include"}
      );

      const data=await response.json().catch(()=>({}));

      if(!response.ok){
        throw new Error(
          data.error||"Unable to load organisation customers."
        );
      }

      const rows=Array.isArray(data.customers)?data.customers:[];
      const teamRows=Array.isArray(data.teams)?data.teams:[];

      setOrganisation(data.organisation||null);
      setTeamCount(teamRows.length);
      setTeams(teamRows);
      setCustomerRows(rows);

      rows.forEach(customer=>{
        customerStrategyStore[customer.id]=cloneStrategy(customer.strategy);
      });
    }catch(e){
      setError(e.message||"Unable to load customers.");
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{
    loadCustomers();
  },[]);

  const openCreate=()=>{
    setCreateForm({
      name:"",
      code:"",
      teamId:""
    });
    setFormError("");
    setShowCreate(true);
  };

  const closeCreate=()=>{
    if(creating)return;

    setShowCreate(false);
    setFormError("");
  };

  const openSetup=(customer,section="details")=>{
    setSelectedCustomer(customer);
    setSetupSection(section);

    setForm({
      name:customer.name||"",
      code:customer.code||"",
      teamId:customer.teamId||""
    });

    setStrategy(cloneStrategy(customer.strategy));
    setSetupError("");
    setSaved(false);
  };

  const closeSetup=()=>{
    if(saving)return;

    setSelectedCustomer(null);
    setSetupError("");
    setSaved(false);
  };

  const createCustomer=async(event)=>{
    event.preventDefault();
    setFormError("");

    const name=createForm.name.trim();
    const code=createForm.code.trim();

    if(!name){
      setFormError("Customer name is required.");
      return;
    }

    if(!code){
      setFormError("Customer code is required.");
      return;
    }

    setCreating(true);

    try{
      const response=await fetch("/api/organisation",{
        method:"POST",
        credentials:"include",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          name,
          code,
          teamId:createForm.teamId||null
        })
      });

      const data=await response.json().catch(()=>({}));

      if(!response.ok){
        throw new Error(
          data.error||"Unable to create customer."
        );
      }

      setShowCreate(false);
      setCreateForm({
        name:"",
        code:"",
        teamId:""
      });

      await loadCustomers();

      const createdCustomer={
        ...(data.customer||{}),
        strategy:data.strategy?.config||cloneStrategy(),
        strategyVersion:data.strategy?.version||1,
        strategyStatus:data.strategy?.status||"active",
        teamId:data.customer?.teamId||createForm.teamId||null
      };

      openSetup(createdCustomer,"details");

      notify(
        `${data.customer?.name||name} created successfully`
      );
    }catch(e){
      setFormError(
        e.message||"Unable to create customer."
      );
    }finally{
      setCreating(false);
    }
  };

  const saveSetup=async(strategyOverride=strategy)=>{
    if(!selectedCustomer)return;

    setSaving(true);
    setSetupError("");
    setSaved(false);

    try{
      const response=await fetch("/api/organisation",{
        method:"PUT",
        credentials:"include",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          customerId:selectedCustomer.id,
          name:form.name.trim(),
          code:form.code.trim(),
          teamId:form.teamId||null,
          strategy:strategyOverride
        })
      });

      const data=await response.json().catch(()=>({}));

      if(!response.ok){
        throw new Error(
          data.error||"Unable to save customer setup."
        );
      }

      const updatedCustomer={
        ...selectedCustomer,
        ...data.customer,
        strategy:data.strategy?.config||strategyOverride,
        strategyVersion:data.strategy?.version||selectedCustomer.strategyVersion||1,
        strategyStatus:data.strategy?.status||"active"
      };

      setSelectedCustomer(updatedCustomer);
      setStrategy(cloneStrategy(updatedCustomer.strategy));

      customerStrategyStore[updatedCustomer.id]=cloneStrategy(
        updatedCustomer.strategy
      );

      setCustomerRows(rows=>
        rows.map(row=>
          row.id===updatedCustomer.id
            ? {...row,...updatedCustomer}
            : row
        )
      );

      setSaved(true);
      notify(`${updatedCustomer.name} setup saved`);
    }catch(e){
      setSetupError(
        e.message||"Unable to save customer setup."
      );
    }finally{
      setSaving(false);
    }
  };

  const updateStrategyArray=(key,value)=>{
    setStrategy(current=>({
      ...current,
      [key]:value
    }));
    setSaved(false);
  };

  const addStrategyItem=(key)=>{
    const labels={
      requiredFields:"Field name",
      extractionRules:"Extraction instruction",
      validationRules:"Validation rule",
      fieldRules:"Field rule",
      customValidations:"Custom validation",
      emailFields:"Email field"
    };

    updateStrategyArray(
      key,
      [...strategy[key],""]
    );
  };

  const removeStrategyItem=(key,index)=>{
    updateStrategyArray(
      key,
      strategy[key].filter((_,itemIndex)=>itemIndex!==index)
    );
  };

  const updateStrategyItem=(key,index,value)=>{
    updateStrategyArray(
      key,
      strategy[key].map((item,itemIndex)=>
        itemIndex===index?value:item
      )
    );
  };

  if(selectedCustomer){
    return <CustomerSetup
      customer={selectedCustomer}
      form={form}
      setForm={setForm}
      strategy={strategy}
      setStrategy={setStrategy}
      section={setupSection}
      setSection={setSetupSection}
      saving={saving}
      saved={saved}
      error={setupError}
      onBack={closeSetup}
      onSave={saveSetup}
      updateStrategyArray={updateStrategyArray}
      addStrategyItem={addStrategyItem}
      removeStrategyItem={removeStrategyItem}
      updateStrategyItem={updateStrategyItem}
      teams={teams}
      customerId={selectedCustomer.id}
      strategyVersion={selectedCustomer.strategyVersion}
      onApplyStrategy={nextStrategy=>saveSetup(nextStrategy)}
    />;
  }

  return <section>
    <div className="page-head">
      <div>
        <div className="eyebrow">Configuration</div>
        <h1>Customers</h1>
        <p>
          Customer-specific extraction strategies, mailboxes and
          validation rules.
        </p>

        {organisation&&
          <span className="summary-kicker">
            {organisation.name} · {teamCount} team{teamCount===1?"":"s"}
          </span>
        }
      </div>

      <button
        className="primary"
        type="button"
        onClick={openCreate}
      >
        <Plus size={17}/>
        Add customer
      </button>
    </div>

    {loading&&
      <div className="panel">
        <div className="setting-status">
          Loading organisation customers…
        </div>
      </div>
    }

    {!loading&&error&&
      <div className="panel">
        <div className="password-login-error">{error}</div>
        <button
          className="secondary"
          type="button"
          onClick={loadCustomers}
        >
          Retry
        </button>
      </div>
    }

    {!loading&&!error&&
      <div className="customer-grid">
        {customerRows.map(customer=>
          <div
            className="customer-card"
            key={customer.id||customer.code}
          >
            <div className="customer-top">
              <div className="customer-logo">
                {customer.name
                  .split(" ")
                  .map(x=>x[0])
                  .slice(0,2)
                  .join("")
                }
              </div>

              <button
                className="row-btn"
                type="button"
                onClick={()=>openSetup(customer,"details")}
                title="Open customer setup"
              >
                <MoreHorizontal size={17}/>
              </button>
            </div>

            <h3>{customer.name}</h3>
            <span className="code">{customer.code}</span>

            <div className="customer-info">
              <div>
                <Mail size={15}/>
                <span>
                  {customer.mailbox||"No mailbox assigned"}
                </span>
              </div>

              <div>
                <Settings size={15}/>
                <span>
                  {customer.rules} strategy rules · v
                  {customer.strategyVersion||1}
                </span>
              </div>

              <div>
                <Activity size={15}/>
                <span>
                  {customer.processed.toLocaleString()}
                  {" "}documents processed
                </span>
              </div>
            </div>

            <button
              className="full-btn"
              type="button"
              onClick={()=>openSetup(customer,"strategy")}
            >
              Open customer setup
              <ArrowRight size={15}/>
            </button>
          </div>
        )}
      </div>
    }

    {showCreate&&
      <div
        className="modal-backdrop"
        onMouseDown={closeCreate}
      >
        <div
          className="modal-card"
          onMouseDown={event=>event.stopPropagation()}
        >
          <div className="modal-head">
            <div>
              <div className="eyebrow">Customer setup</div>
              <h2>Create customer</h2>
              <p>
                Create the customer, then configure its complete
                setup in one workspace.
              </p>
            </div>

            <button
              className="row-btn"
              type="button"
              onClick={closeCreate}
              disabled={creating}
            >
              <X size={18}/>
            </button>
          </div>

          <form onSubmit={createCustomer}>
            <label className="field">
              <span>Customer name <strong>*</strong></span>

              <input
                value={createForm.name}
                onChange={event=>
                  setCreateForm({
                    ...createForm,
                    name:event.target.value
                  })
                }
                placeholder="e.g. Acme Components Ltd"
                autoFocus
                disabled={creating}
              />
            </label>

            <label className="field">
              <span>Customer code <strong>*</strong></span>

              <input
                value={createForm.code}
                onChange={event=>
                  setCreateForm({
                    ...createForm,
                    code:event.target.value
                  })
                }
                placeholder="e.g. ACME"
                disabled={creating}
              />

              <small>
                Use a short internal identifier for the customer.
              </small>
            </label>

            <label className="field">
              <span>Team</span>

              <select
                value={createForm.teamId}
                onChange={event=>
                  setCreateForm({
                    ...createForm,
                    teamId:event.target.value
                  })
                }
                disabled={creating}
              >
                <option value="">No team assigned</option>

                {teams.map(team=>
                  <option
                    key={team.id}
                    value={team.id}
                  >
                    {team.name}
                  </option>
                )}
              </select>
            </label>

            {formError&&
              <div className="password-login-error">
                {formError}
              </div>
            }

            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={closeCreate}
                disabled={creating}
              >
                Cancel
              </button>

              <button
                className="primary"
                type="submit"
                disabled={creating}
              >
                {creating
                  ?"Creating…"
                  :"Create & configure"
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  </section>;
}

function CustomerSetup({
  customer,
  form,
  setForm,
  strategy,
  setStrategy,
  section,
  setSection,
  saving,
  saved,
  error,
  onBack,
  onSave,
  updateStrategyArray,
  addStrategyItem,
  removeStrategyItem,
  updateStrategyItem,
  teams,
  customerId,
  strategyVersion,
  onApplyStrategy
}){
  return <section className="customer-setup">
    <div className="customer-setup-header">
      <div className="customer-setup-heading">
        <button
          className="back-link customer-setup-back"
          type="button"
          onClick={onBack}
          disabled={saving}
        >
          <ArrowLeft size={16}/>
          Back to customers
        </button>

        <div className="customer-setup-title-row">
          <div className="customer-logo">
            {String(form.name||customer.name).split(" ").map(x=>x[0]).slice(0,2).join("")}
          </div>
          <div>
            <div className="eyebrow">Customer Setup</div>
            <h1>{form.name||customer.name}</h1>
            <div className="customer-setup-meta">
              <span>{form.code||customer.code}</span>
              <span className="active-status"><i/>Active</span>
            </div>
          </div>
        </div>
      </div>

      <div className="setup-actions">
        {saved&&
          <span className="saved-indicator">
            <Check size={15}/>
            Saved
          </span>
        }

        <button
          className="primary"
          type="button"
          onClick={onSave}
          disabled={saving}
        >
          <Save size={16}/>
          {saving?"Saving…":"Save changes"}
        </button>
      </div>
    </div>

    <div className="setup-tabs" role="tablist" aria-label="Customer setup sections">
          {SETUP_SECTIONS.map(item=>{
            const Icon=item.icon;
            const active=item.id===section;

            return <button
              key={item.id}
              className={`setup-nav-item${active?" active":""}`}
              type="button"
              onClick={()=>setSection(item.id)}
            >
              <Icon size={17}/>
              <span>{item.label}</span>

              {item.id==="strategy"&&
                <span className="setup-nav-count">
                  {countStrategyRules(strategy)}
                </span>
              }
            </button>;
          })}
    </div>

    <main className="customer-setup-content">
        {section==="details"&&
          <DetailsSection
            form={form}
            setForm={setForm}
            teams={teams}
          />
        }

        {section==="strategy"&&
          <StrategySection
            strategy={strategy}
            setStrategy={setStrategy}
            customerId={customerId}
            strategyVersion={strategyVersion}
            onApplyStrategy={onApplyStrategy}
            updateStrategyArray={updateStrategyArray}
            addStrategyItem={addStrategyItem}
            removeStrategyItem={removeStrategyItem}
            updateStrategyItem={updateStrategyItem}
          />
        }

        {section==="knowledge"&&
          <PlaceholderSection
            icon={BookOpen}
            title="Agent Knowledge"
            description="Customer-specific processing knowledge will live here."
            items={[
              "Document patterns",
              "Customer-specific instructions",
              "Known document terminology",
              "Processing guidance"
            ]}
          />
        }

        {section==="mailbox"&&
          <PlaceholderSection
            icon={Mail}
            title="Mailbox"
            description="Customer email routing and mailbox configuration will live here."
            items={[
              "Customer mailbox",
              "Incoming email routing",
              "Outlook connection",
              "Attachment processing"
            ]}
          />
        }

        {section==="memory"&&
          <PlaceholderSection
            icon={Sparkles}
            title="Memory"
            description="Confirmed customer-specific knowledge and learning history will live here."
            items={[
              "Confirmed knowledge",
              "Learned processing behaviour",
              "Source pack",
              "Confidence and audit history"
            ]}
          />
        }

        {error&&
          <div className="password-login-error setup-error">
            {error}
          </div>
        }
    </main>
  </section>;
}

function DetailsSection({form,setForm,teams}){
  return <div className="setup-section">
    <div className="setup-section-head">
      <div>
        <div className="eyebrow">Customer identity</div>
        <h2>Details</h2>
        <p>
          These details identify the persistent customer record
          used throughout the platform.
        </p>
      </div>
    </div>

    <div className="setup-form-grid">
      <label className="field">
        <span>Customer name <strong>*</strong></span>

        <input
          value={form.name}
          onChange={event=>
            setForm({
              ...form,
              name:event.target.value
            })
          }
        />
      </label>

      <label className="field">
        <span>Customer code <strong>*</strong></span>

        <input
          value={form.code}
          onChange={event=>
            setForm({
              ...form,
              code:event.target.value
            })
          }
        />

        <small>
          Short internal identifier used by the organisation.
        </small>
      </label>

      <label className="field">
        <span>Team</span>

        <select
          value={form.teamId}
          onChange={event=>
            setForm({
              ...form,
              teamId:event.target.value
            })
          }
        >
          <option value="">No team assigned</option>

          {teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </label>
    </div>

    <div className="setup-info-card">
      <Settings size={18}/>

      <div>
        <strong>Customer identity is persistent</strong>

        <p>
          The customer UUID is the permanent identity used to
          associate packs, strategies, mailboxes and future
          customer memory.
        </p>
      </div>
    </div>
  </div>;
}

function StrategySection({
  strategy,
  setStrategy,
  customerId,
  strategyVersion,
  onApplyStrategy
}){
  const [prompt,setPrompt]=useState("");
  const [messages,setMessages]=useState([]);
  const [activeProposal,setActiveProposal]=useState(null);
  const [agentError,setAgentError]=useState("");
  const [asking,setAsking]=useState(false);
  const historyRef=useRef(null);
  const version=Number(strategyVersion);

  const askAgent=async()=>{
    if(!prompt.trim())return;
    const question=prompt.trim();
    const userMessage={type:"user",text:question};
    const conversation=[...messages,userMessage];
    setAsking(true);setAgentError("");setActiveProposal(null);setMessages(conversation);setPrompt("");
    try{
      const response=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        message:question,
        pack:{type:"customer_strategy",id:customerId,customerId,customer:"Customer",customerStrategy:strategy,conversation:conversation.slice(-12)}
      })});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||"Unable to ask the Agent.");
      if(data.action!=="strategy_proposal"||!data.strategyProposal?.resultingStrategy){
        setMessages(current=>[...current,{type:"agent",text:data.reply||"The Agent needs more detail before it can propose a strategy change."}]);
      }else{
        setActiveProposal(data.strategyProposal);
        setMessages(current=>[...current,{type:"agent",text:data.reply||`I've identified ${data.strategyProposal.changes.length} strategy change${data.strategyProposal.changes.length===1?"":"s"}.`,proposal:data.strategyProposal}]);
      }
    }catch(error){
      const text=error.message||"Unable to ask the Agent.";
      setAgentError(text);setMessages(current=>[...current,{type:"agent",text:"I couldn't reach the strategy Agent. "+text}]);
    }
    finally{setAsking(false);}
  };

  useEffect(()=>{
    if(historyRef.current)historyRef.current.scrollTop=historyRef.current.scrollHeight;
  },[messages,activeProposal]);

  const applyProposal=async()=>{
    if(!activeProposal)return;
    const next=activeProposal.resultingStrategy;
    setStrategy(next);
    setActiveProposal(null);
    await onApplyStrategy(next);
    setMessages(current=>[...current,{type:"agent",text:"Strategy updated. The active strategy has been saved."}]);
  };

  return <div className="setup-section">
    <div className="setup-section-head">
      <div>
        <div className="eyebrow">Customer processing</div>
        <h2>Customer Strategy</h2>
        <p>Tell the Agent how this customer should be processed.</p>
      </div>

      <span className="strategy-version">
        {version>0?`Strategy v${version}`:"No strategy configured"}
      </span>
    </div>

    <div className="strategy-agent-chat chat-review-panel">
      <div className="chat-review-head"><div className="agent-title"><div className="agent-orb"><Sparkles size={18}/></div><div><b>Strategy Agent</b><span>Customer processing strategy assistant</span></div></div></div>
      <div ref={historyRef} className="chat-review-history strategy-chat-history">
        {!messages.length&&<div className="strategy-chat-welcome"><Sparkles size={22}/><strong>Ask the Agent about this customer strategy</strong><span>Describe a processing preference or ask for a strategy change.</span></div>}
        {messages.map((message,index)=><div className={`chat-message-row ${message.type}`} key={index}><div className="chat-message-avatar">{message.type==="user"?"You":<Sparkles size={15}/>}</div><div className="chat-message-content"><div className="chat-message-text">{message.text}</div>{message.proposal&&activeProposal===message.proposal&&<div className="strategy-chat-proposal"><div className="strategy-change-list">{message.proposal.changes.map((change,changeIndex)=><div key={changeIndex}><Check size={16}/><span>{change.after}</span></div>)}</div><p>Would you like me to apply this strategy?</p><div className="strategy-proposal-actions"><button className="secondary" type="button" onClick={()=>setActiveProposal(null)}>Cancel</button><button className="primary" type="button" onClick={applyProposal}>Apply strategy</button></div></div>}</div></div>)}
        {asking&&<div className="chat-message-row agent"><div className="chat-message-avatar"><Sparkles size={15}/></div><div className="chat-message-content"><div className="chat-message-text">I'm thinking through the customer's processing strategy…</div></div></div>}
      </div>
      <div className="chat-input strategy-chat-input"><input value={prompt} onChange={event=>setPrompt(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();askAgent();}}} placeholder="Ask for follow-up changes…"/><button type="button" onClick={askAgent} disabled={asking||!prompt.trim()} aria-label="Send strategy request"><ArrowRight size={16}/></button></div>
    </div>
    <StrategyReadableCard title="Current strategy" strategy={strategy}/>
    {agentError&&<div className="strategy-agent-message">{agentError}</div>}
  </div>;
}

function StrategyReadableCard({title,strategy}){
  const statements=[];
  const labels={requiredFields:"Required field",extractionRules:"Extraction rule",validationRules:"Validation rule",fieldRules:"Field rule",customValidations:"Custom validation",emailFields:"Email field"};
  Object.entries(labels).forEach(([key,label])=>(Array.isArray(strategy[key])?strategy[key]:[]).forEach(value=>{
    const readable=typeof value==="string"?value.trim():value&&typeof value==="object"?Object.values(value).filter(item=>typeof item==="string"&&item.trim()).join(" — "):"";
    if(readable)statements.push(`${label}: ${readable}`);
  }));
  statements.push(strategy.autoApplyWeightApportionment?"Automatic weight apportionment enabled":"Automatic weight apportionment disabled");
  return <div className="strategy-readable-card"><div className="strategy-card-label">{title}</div>{statements.length?statements.map((statement,index)=><div className="strategy-readable-row" key={index}><Check size={15}/><span>{statement}</span></div>):<div className="strategy-readable-empty">No strategy configured yet.</div>}</div>;
}

function StrategyRuleGroup({
  group,
  values,
  addItem,
  removeItem,
  updateItem
}){
  return <div className="strategy-rule-group">
    <div className="strategy-rule-head">
      <div>
        <h3>{group.title}</h3>
        <p>{group.description}</p>
      </div>

      <button
        className="secondary"
        type="button"
        onClick={addItem}
      >
        <Plus size={15}/>
        Add
      </button>
    </div>

    {values.length===0&&
      <div className="empty-rule">
        <div className="empty-rule-icon"><Sparkles size={17}/></div>
        <strong>No {group.title.toLowerCase()} yet</strong>
        <span>Add a rule to tell the IDP agent how this customer's documents should be interpreted.</span>
        <button className="secondary" type="button" onClick={addItem}>
          <Plus size={15}/> Add {group.title.toLowerCase().replace(/s$/, "")}
        </button>
      </div>
    }

    {values.map((value,index)=>
      <div
        className="strategy-rule-row"
        key={`${group.key}-${index}`}
      >
        <input
          value={
            typeof value==="string"
              ?value
              :JSON.stringify(value)
          }
          onChange={event=>
            updateItem(
              index,
              event.target.value
            )
          }
          placeholder={
            group.key==="requiredFields"
              ?"e.g. invoiceNumber"
              :"Describe the customer rule"
          }
        />

        <button
          className="row-btn rule-delete"
          type="button"
          onClick={()=>removeItem(index)}
          title="Remove rule"
        >
          <Trash2 size={15}/>
        </button>
      </div>
    )}
  </div>;
}

function PlaceholderSection({
  icon:Icon,
  title,
  description,
  items
}){
  return <div className="setup-section">
    <div className="setup-section-head">
      <div>
        <div className="eyebrow">Customer configuration</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>

    <div className="setup-placeholder-grid">
      {items.map(item=>
        <div
          className="setup-placeholder-card"
          key={item}
        >
          <Icon size={18}/>
          <div>
            <strong>{item}</strong>
            <span>Configuration will be added here.</span>
          </div>
        </div>
      )}
    </div>

    <div className="setup-info-card">
      <Sparkles size={18}/>

      <div>
        <strong>Designed for Agent-assisted setup</strong>

        <p>
          The Inbox Agent will eventually be able to take natural
          language instructions from the user and propose
          configuration here for confirmation.
        </p>
      </div>
    </div>
  </div>;
}

function countStrategyRules(strategy){
  if(!strategy||typeof strategy!=="object")return 0;

  const keys=[
    "emailFields",
    "validationRules",
    "extractionRules",
    "requiredFields",
    "fieldRules",
    "customValidations"
  ];

  return keys.reduce((count,key)=>{
    const value=strategy[key];

    if(Array.isArray(value)){
      return count+value.length;
    }

    if(value&&typeof value==="object"){
      return count+Object.keys(value).length;
    }

    return count;
  },0);
}

export { Customers };
