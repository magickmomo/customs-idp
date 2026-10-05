import { getCustomerStrategy, normalizeCountryCode } from "./packData.js";

export function buildWorkingCustomsRecord(pack){
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
      countryOfExport:["countryOfExport","countryOfOrigin","exportCountry","exporterCountryIso","sourceCountryCode"],
      sourceCountryOfDestination:["sourceCountryOfDestination","countryOfImport","countryOfDestination","consigneeCountryIso"],
      deliveryTerm:["deliveryTerm","terms"]
    };
    Object.entries(aliases).forEach(([target,keys])=>{
      if(!isMissing(merged[target]))return;
      for(const key of keys){
        const value=merged[key]??supportingValues(key);
        if(!isMissing(value)){merged[target]=value;break;}
      }
    });
    // Prefer the strategy selected and persisted on this pack. Fall back to
    // the legacy name-based store only for older packs that pre-date customer UUIDs.
    const strategy=pack?.customerStrategy&&typeof pack.customerStrategy==="object"
      ? pack.customerStrategy
      : getCustomerStrategy(pack?.customer),eo=strategy?.customsSummaryExportField||strategy?.customsSummary?.exportField,di=strategy?.customsSummaryDestinationField||strategy?.customsSummary?.destinationField;
    if(eo&&!isMissing(merged[eo]))merged.countryOfExport=normalizeCountryCode(merged[eo]);else if(isMissing(merged.countryOfExport)&&!isMissing(merged.exporterCountryIso))merged.countryOfExport=normalizeCountryCode(merged.exporterCountryIso);
    if(di&&!isMissing(merged[di]))merged.sourceCountryOfDestination=normalizeCountryCode(merged[di]);else if(isMissing(merged.sourceCountryOfDestination)&&!isMissing(merged.consigneeCountryIso))merged.sourceCountryOfDestination=normalizeCountryCode(merged.consigneeCountryIso);

    // Apply deterministic customer strategy flags to the working customs record.
    // These are explicit configuration values, not AI guesses.
    if(strategy?.exporterAddress){
      merged.exporterAddress=strategy.exporterAddress;
    }
    if(strategy?.importerAddress){
      merged.importerAddress=strategy.importerAddress;
      merged.consigneeAddress=strategy.importerAddress;
    }

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
    // Customer strategies may define "line value" as the extracted unit price.
    // Materialise that value on the working line so both weight apportionment
    // and total-invoice calculation use the configured rule consistently.
    if(strategy?.totalInvoiceFromLines===true){
      mergedLines.forEach(line=>{
        if(isMissing(line.totalValue)&&!isMissing(line.unitValue)){
          line.totalValue=line.unitValue;
        }
      });
    }
    const allocationBasis=mergedLines.map(line=>toNumber(line.totalValue??line.lineValue??line.unitValue));
    const quantityBasis=mergedLines.map(line=>toNumber(line.quantity));
    const basis=allocationBasis.every(v=>v!==null&&v>=0)&&allocationBasis.some(v=>v>0)
      ? allocationBasis
      : quantityBasis.every(v=>v!==null&&v>=0)&&quantityBasis.some(v=>v>0)
        ? quantityBasis
        : mergedLines.map(()=>1);
    const basisTotal=basis.reduce((sum,v)=>sum+(v||0),0);

    const weightApportionmentApproved = pack?.extractedData?.weightApportionmentDecision?.status==="approved" || strategy?.autoApplyWeightApportionment===true;
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

    if(strategy?.lineCurrencyFromHeader===true){
      const headerCurrency=merged.currency||merged.invoiceCurrency||merged.headerCurrency||merged.currencyCode||"";
      if(headerCurrency){
        merged.lines=merged.lines.map(line=>({...line,currency:headerCurrency}));
      }
    }

    if(strategy?.totalInvoiceFromLines===true){
      const linesForTotal=Array.isArray(merged.lines)?merged.lines:[];
      const lineAmounts=linesForTotal.map(line=>Number(String(line?.totalValue??line?.lineValue??line?.unitValue??"").replace(/,/g,"").trim()));
      if(lineAmounts.length&&lineAmounts.every(Number.isFinite)){
        const total=lineAmounts.reduce((sum,value)=>sum+value,0);
        merged.totalInvoiceValue=Math.round(total*100)/100;
        if(merged.invoiceTotal!==undefined)merged.invoiceTotal=merged.totalInvoiceValue;
      }
    }

    merged.workingRecordSource="primary invoice + supporting documents";
    merged.sourceDiscrepancies=sourceDiscrepancies;
    return merged;
}
