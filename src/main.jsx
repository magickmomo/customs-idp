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
 const sourceButton=(label,docId,page)=><button type="button" className="source-reference" onClick={()=>{setSelectedDocumentId(docId);setPreviewPage(Number(page)||1);setShowPreview(true);}}>{label}</button>;

 const buildSummary=()=>{
   const docs=extractedDocuments;
   const invoiceDoc=docs.find(d=>d.extraction?.documentType==="commercial_invoice")||docs[0];
   const invoice=invoiceDoc?.extraction||{};
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
   const lines=Array.isArray(invoice.lines)?invoice.lines:[];
   const findSourceLine=(doc,invLine)=>{
     const sourceLines=Array.isArray(doc?.extraction?.lines)?doc.extraction.lines:[];
     return sourceLines.find(l=>lineKey(l)===lineKey(invLine))||sourceLines.find(l=>String(l.description||"").trim().toLowerCase()===String(invLine.description||"").trim().toLowerCase());
   };

   const selectedWeightSource=pack.extractedData?.weightSourceDecision?.source||null;
   const customsLines=lines.map((line,index)=>{
     const plLine=packingDoc?findSourceLine(packingDoc,line):null;
     const workingNet=selectedWeightSource==="packing_list"?plLine?.netMassKg:line.netMassKg;
     const workingGross=selectedWeightSource==="packing_list"?plLine?.grossMassKg:line.grossMassKg;
     return {
       no:index+1,
       description:value(line.description)||"Unnamed goods line",
       hs:value(line.hsCode),
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
   const agentIssues=[];
   const exportCountry=String(invoice.countryOfExport||"").trim().toUpperCase();
   const exporterIso=String(invoice.exporterCountryIso||"").trim().toUpperCase();
   const exporterEori=String(invoice.exporterEoriNo||"").trim();
   const isGBExporter=exportCountry==="GB"||exporterIso==="GB"||/(?:^|[\\n, ])(?:GB|UK|UNITED KINGDOM)(?:$|[\\n, ])/i.test(String(invoice.exporterAddress||""));
   if(isGBExporter&&!exporterEori) agentIssues.push({title:"GB exporter EORI missing",detail:"The exporter is identified as GB, but no EORI number was extracted. Check the source document and correct the EORI before validation."});
   const addressFields=[
     ["Exporter address line 1",invoice.exporterAddressLine1],["Exporter postcode/ZIP",invoice.exporterPostcode],["Exporter city",invoice.exporterCity],["Exporter country ISO",invoice.exporterCountryIso],
     ["Consignee address line 1",invoice.consigneeAddressLine1],["Consignee postcode/ZIP",invoice.consigneePostcode],["Consignee city",invoice.consigneeCity],["Consignee country ISO",invoice.consigneeCountryIso]
   ];
   addressFields.forEach(([label,v])=>{if(!hasValue(v))agentIssues.push({title:label+" missing",detail:"This address component was not extracted. Check the source document and correct it before validation."});});
   if(lines.some(l=>!hasValue(l.hsCode)))agentIssues.push({title:"HS code missing",detail:"One or more goods lines do not have an HS code. Correct the affected line before validation."});
   if(lines.some(l=>!hasValue(l.sourceCountryCode)))agentIssues.push({title:"Country of origin missing",detail:"One or more goods lines do not have a country-of-origin code. Correct the affected line before validation."});

   return [
     {type:"agent",text:"I've reviewed the extracted pack. I will surface extraction and document issues here first; corrections can be made through the agent, and Validate data is the final gate before posting to LCA.",persist:false},
     ...(agentIssues.length?[{type:"agentIssues",issues:agentIssues,persist:false}]:[{type:"agent",text:"No immediate extraction issues were detected from the available pack data. Validate data is still required before posting to LCA.",persist:false}]),
     {
       type:"customsEntrySummary",
       summary:{
         invoice:value(invoice.invoiceNumber),exporter:value(invoice.exporter),consignee:value(invoice.consignee),
         currency:value(invoice.currency),invoiceValue:value(invoice.totalInvoiceValue),exportCountry:value(invoice.countryOfExport),exporterAddress:value(invoice.exporterAddress),exporterAddressLine1:value(invoice.exporterAddressLine1),exporterPostcode:value(invoice.exporterPostcode),exporterCity:value(invoice.exporterCity),exporterCountryIso:value(invoice.exporterCountryIso),exporterEoriNo:value(invoice.exporterEoriNo),consigneeAddress:value(invoice.consigneeAddress),consigneeAddressLine1:value(invoice.consigneeAddressLine1),consigneePostcode:value(invoice.consigneePostcode),consigneeCity:value(invoice.consigneeCity),consigneeCountryIso:value(invoice.consigneeCountryIso),
         destination:value(invoice.sourceCountryOfDestination),packages:value(invoice.totalPackages),
         gross:value(selectedWeightSource==="packing_list"?packingDoc?.extraction?.totalGrossWeight:invoice.totalGrossWeight),
         net:value(selectedWeightSource==="packing_list"?packingDoc?.extraction?.totalNetWeight:invoice.totalNetWeight),
         deliveryTerm:value(invoice.deliveryTerm),lines:customsLines,
         sourceLabel:invoiceDoc?.filename||"Commercial Invoice",sourceDocumentId:invoiceDoc?.id||null,sourcePage:sourceFor(invoiceDoc),weightSourceDecision:pack.extractedData?.weightSourceDecision?.source||null
       },
       persist:false
     },
     {type:"validationSummary",checks:Array.isArray(pack.validationChecks)&&pack.validationChecks.length?pack.validationChecks:(Array.isArray(pack.extractedData?.validationChecks)&&pack.extractedData.validationChecks.length?pack.extractedData.validationChecks:checks),persist:false},
     ...(conflicts.length&&!pack.extractedData?.weightSourceDecision?[{
       type:"weightDecision",
       text:"Weight discrepancy detected. The invoice and packing list contain different line-level weights. No value has been silently chosen.",
       conflicts,
       persist:false
     }]:[{type:"agent",text:"Cross-document validation: no line-level weight source conflicts require a decision.",persist:false}])
   ];
 };
 useEffect(()=>{
   const saved=Array.isArray(pack.extractedData?.agentMessages)?pack.extractedData.agentMessages:[];
   setMessages([...buildSummary(),...saved]);
 },[pack.id,pack.extractedData?.extractionRunId,pack.validationStatus,pack.validationChecks,pack.extractedData?.validationStatus,pack.extractedData?.validationChecks,extractedDocuments]);
 useEffect(()=>{if(!documentRows.length){setSelectedDocumentId(null);return;}setSelectedDocumentId(current=>documentRows.some(d=>(d.id||d.name)===current)?current:(documentRows[0].id||documentRows[0].name));},[pack.id,pack.uploadedFiles?.length]);

 const selectedDocument=documentRows.find(d=>(d.id||d.name)===selectedDocumentId)||documentRows[0];
 const selectedDocumentUrl=selectedDocument?docUrls[selectedDocument.id]:null;
 const selectedDocumentIsPdf=/\.pdf$/i.test(selectedDocument?.name||"");
 const selectedDocumentIsImage=/^image\//i.test(selectedDocument?.type||"")||/\.(png|jpe?g|webp|gif)$/i.test(selectedDocument?.name||"");
 const selectedDocumentFrameUrl=selectedDocumentUrl&&selectedDocumentIsPdf?selectedDocumentUrl+"#page="+previewPage+"&view=FitH&zoom=page-width":selectedDocumentUrl;
 useEffect(()=>{try{localStorage.setItem("customs-idp-review-preview",showPreview?"on":"off");}catch{}},[showPreview]);
 useEffect(()=>{try{localStorage.setItem("customs-idp-review-split",String(reviewSplit));}catch{}},[reviewSplit]);
 useEffect(()=>{if(!resizing)return;const onMove=e=>{const workspace=document.querySelector(".review-workspace-split");if(!workspace)return;const rect=workspace.getBoundingClientRect();setReviewSplit(Math.max(32,Math.min(68,((e.clientX-rect.left)/rect.width)*100)));};const onUp=()=>setResizing(false);window.addEventListener("pointermove",onMove);window.addEventListener("pointerup",onUp);document.body.classList.add("review-resizing");return()=>{window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onUp);document.body.classList.remove("review-resizing");};},[resizing]);

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
 const serialiseMessage=m=>({type:m.type||"agent",text:m.text||"",sourceDocumentId:m.sourceDocumentId||null,sourcePage:Number.isInteger(m.sourcePage)?m.sourcePage:null,sourceLabel:m.sourceLabel||null});
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
     const response=await fetch("/api/agent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:q,pack:{...pack,extractedData:{...(pack.extractedData||{}),agentMessages:undefined}}})});
     const result=await response.json();
     if(!response.ok)throw new Error(result.error||"Agent request failed");
     let reply=result.reply||"I couldn't produce an answer from the supplied pack.";
     let savedPack=pack;
     if(result.action==="update_field"&&result.target){
       const target=result.target;
       const data=JSON.parse(JSON.stringify(pack.extractedData||{}));
       if(target.scope==="line"&&Number.isInteger(target.lineIndex)&&data.lines?.[target.lineIndex]) data.lines[target.lineIndex][target.field]=target.value;
       else if(target.scope==="primary"&&target.field) data[target.field]=target.value;
       else throw new Error("The agent returned an invalid correction target.");
       data.reviewOverrides=[...(data.reviewOverrides||[]),{scope:target.scope,field:target.field,lineIndex:target.lineIndex??null,oldValue:target.scope==="line"?pack.extractedData?.lines?.[target.lineIndex]?.[target.field]:pack.extractedData?.[target.field],newValue:target.value,sourceDocumentId:target.sourceDocumentId||null,sourcePage:target.sourcePage||null,createdAt:new Date().toISOString()}];
       savedPack={...pack,extractedData:data,status:"Needs review",validationStatus:undefined,validationChecks:undefined,postedToLCAAt:undefined};
       reply+=" I saved that correction to the pack and cleared the previous validation result. The affected data needs to be validated again.";
     }
     const agentMessage={type:"agent",text:reply,sourceDocumentId:result.target?.sourceDocumentId||null,sourcePage:result.target?.sourcePage||null,persist:true};
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
 const emailWeightIssue=conflicts=>{
   const displayValue=v=>v===undefined||v===null||v===""?"—":String(v);
   const subject="Customs IDP - weight confirmation required";
   const body="Hello,\\n\\nWe have found differences between the Commercial Invoice and Packing List weights. Please confirm which weights should be used for the customs declaration.\\n\\n"+conflicts.map(c=>"- "+(c.invoice.description||"Goods line")+": Commercial Invoice net "+displayValue(c.invoice.netMassKg)+" kg / gross "+displayValue(c.invoice.grossMassKg)+" kg; Packing List net "+displayValue(c.line.netMassKg)+" kg / gross "+displayValue(c.line.grossMassKg)+" kg.").join("\\n")+"\\n\\nRegards\\nCustoms IDP";
   setEmailDraft({to:"",subject,body});
 };
 const renderMessage=(m,i)=>{
   const source=m.sourceDocumentId&&m.sourcePage?sourceButton(m.sourceLabel||("Source — page "+m.sourcePage),m.sourceDocumentId,m.sourcePage):null;
   if(m.type==="weightDecision"){
     return <div className="chat-message-row agent" key={i}><div className="chat-message-avatar"><Sparkles size={15}/></div><div className="chat-message-content"><div className="chat-message-text">{m.text.split("\n").map((x,j)=><React.Fragment key={j}>{x}{j<m.text.split("\n").length-1&&<br/>}</React.Fragment>)}</div><div className="weight-decision-actions"><button className="secondary" onClick={()=>decideWeights("invoice",m.conflicts)}>Use Commercial Invoice weights</button><button className="secondary" onClick={()=>decideWeights("packing_list",m.conflicts)}>Use Packing List weights</button><button className="secondary" onClick={()=>emailWeightIssue(m.conflicts)}><Mail size={15}/> Email customer</button></div></div></div>;
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
           <div className="customs-summary-title">
             <div><span className="summary-kicker">CUSTOMS ENTRY SUMMARY</span><h3>{s.invoice||"Customs entry"}</h3></div>
             <span className="summary-status">Source: {s.sourceLabel}</span>
           </div>
           {s.weightSourceDecision&&<div className="weight-source-selected"><CheckCircle2 size={15}/><span><b>Working weights:</b> {s.weightSourceDecision==="packing_list"?"Packing List":"Commercial Invoice"} selected. The selected values are now used for customs validation and downstream data.</span></div>}
           <div className="customs-party-grid">
             <div className="customs-party-card">
               <span className="customs-party-label">Exporter</span>
               <b>{s.exporter||"—"}</b>
               <div className="customs-address-block">
                 {s.exporterAddressLine1
                   ? <>{renderAddress(s.exporterAddressLine1,"","")}<span>{s.exporterPostcode||""}</span><span>{s.exporterCity||""}</span><span>{s.exporterCountryIso||""}</span></>
                   : renderAddress("",s.exporterAddress,"")}
                 {s.exporterEoriNo&&<span><strong>EORI:</strong> {s.exporterEoriNo}</span>}
               </div>
             </div>
             <div className="customs-party-card">
               <span className="customs-party-label">Consignee</span>
               <b>{s.consignee||"—"}</b>
               <div className="customs-address-block">
                 {s.consigneeAddressLine1
                   ? <>{renderAddress(s.consigneeAddressLine1,"","")}<span>{s.consigneePostcode||""}</span><span>{s.consigneeCity||""}</span><span>{s.consigneeCountryIso||""}</span></>
                   : renderAddress("",s.consigneeAddress,"")}
               </div>
             </div>
           </div>
           <div className="customs-header-table">
             <div>
               <div><span>Currency</span><b>{s.currency||"—"}</b></div>
               <div><span>Invoice Value</span><b>{s.invoiceValue?((s.currency||"")+" "+s.invoiceValue):"—"}</b></div>
               <div><span>Export</span><b>{s.exportCountry||"—"}</b></div>
               <div><span>Destination</span><b>{s.destination||"—"}</b></div>
               <div><span>Packages</span><b>{s.packages||"—"}</b></div>
               <div><span>Gross Weight</span><b>{s.gross?s.gross+" kg":"—"}</b></div>
               <div><span>Net Weight</span><b>{s.net?s.net+" kg":"—"}</b></div>
               <div><span>Delivery Term</span><b>{s.deliveryTerm||"—"}</b></div>
             </div>
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
     return <div className="chat-message-row agent" key={i}><div className="chat-message-avatar"><AlertCircle size={15}/></div><div className="chat-message-content"><div className="validation-summary-card"><div className="customs-summary-title"><div><span className="summary-kicker">EXTRACTION AGENT</span><h3>Issues requiring attention</h3></div></div><div className="validation-check-list">{m.issues.map((issue,idx)=><div className="validation-check warning" key={idx}><span>!</span><div><b>{issue.title}</b><small>{issue.detail}</small></div></div>)}</div><div className="chat-message-text" style={{marginTop:"10px"}}>Correct these issues with the agent, then click <b>Validate data</b>. Validation is the final gate before posting to LCA.</div></div></div></div>;
   }
   if(m.type==="validationSummary"&&Array.isArray(m.checks)){
     return <div className="chat-message-row agent" key={i}><div className="chat-message-avatar"><ShieldCheck size={15}/></div><div className="chat-message-content"><div className="validation-summary-card"><div className="customs-summary-title"><div><span className="summary-kicker">VALIDATION RESULTS</span><h3>Document and customs checks</h3></div></div><div className="validation-check-list">{m.checks.map((check,idx)=><div className={"validation-check "+check.status} key={idx}><span>{check.status==="pass"?"✓":check.status==="not_applicable"?"—":"!"}</span><div><b>{check.label||check.check||"Validation check"}</b><small>{check.detail||check.message||""}</small></div></div>)}</div></div></div></div>;
   }
   return <div className={"chat-message-row "+(m.type||"agent")} key={i}><div className="chat-message-avatar">{m.type==="user"?"You":<Sparkles size={15}/>}</div><div className="chat-message-content"><div className="chat-message-text">{m.text}</div>{source&&<div className="chat-source">{source}</div>}</div></div>;
 };

 return <section>
   <button className="back" onClick={back}>← Back to inbox</button>
   <div className="review-head"><div><div className="eyebrow">{pack.id} · {pack.ticket}</div><h1>{pack.customer}</h1><p>{pack.docs} documents · received {pack.received}</p></div><div className="review-actions"><select className="owner-select review-owner" value={pack.assignedTo||"Unassigned"} onChange={e=>onAssign?.(pack.id,e.target.value)}><option>Unassigned</option><option>Liam Wingrove</option><option>Data Processor 1</option><option>Data Processor 2</option><option>Muhammad Amer</option></select><Status status={pack.status}/><button className="secondary" onClick={()=>reprocessPack?.(pack)}>Re-process</button><button className="secondary" onClick={validatePack}>Validate data</button><button className={pack.status==="Ready"?"primary":"secondary"} onClick={postToLCA}>Post to LCA</button></div></div>
   <div className="review-preview-toggle-row"><label className="review-preview-toggle"><input type="checkbox" checked={showPreview} onChange={e=>setShowPreview(e.target.checked)}/><span className="review-toggle-track"><i></i></span><span>Show preview</span></label><button className="secondary review-fit-btn" onClick={()=>setReviewSplit(50)}>Reset split</button></div>
   <div className={"review-workspace-split "+(!showPreview?"preview-hidden":"")} style={{"--review-split":showPreview?reviewSplit:100}}>
     <div className="review-left-column"><div className="panel chat-review-panel">
       <div className="chat-review-head"><div className="agent-title"><div className="agent-orb"><Sparkles size={18}/></div><div><b>Extraction Agent</b><span>Source-grounded document review</span></div></div><span className="online-pill"><span></span> Ready</span></div>
       <div className="chat-review-intro">I read the complete document pack first. The conversation below is the review record: extracted values stay connected to their source, and discrepancies are surfaced rather than silently resolved.</div>
       <div className="chat-history chat-review-history">{messages.map(renderMessage)}</div>
       <div className="chat-input chat-review-input"><input value={chat} onChange={e=>setChat(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Ask where a value came from, why it was used, or tell the agent what to change..."/><button onClick={sendChat}><ArrowRight size={16}/></button></div>
     </div></div>
     {showPreview&&<><div className={"review-resizer "+(resizing?"active":"")} role="separator" aria-label="Resize chat and document preview" onPointerDown={e=>{e.preventDefault();setResizing(true);}} title="Drag to resize"></div>
       <div className="review-right-column"><div className="panel review-documents-panel">