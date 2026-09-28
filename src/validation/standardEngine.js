const ISO2=/^[A-Z]{2}$/;
const CURRENCY=/^[A-Z]{3}$/;
const HS=/^\d{4,10}$/;
const IM_PROCEDURE=/^\d{10}$/;

const hasValue=value=>value!==undefined&&value!==null&&String(value).trim()!=="";
const text=value=>String(value??"").trim();
const numberValue=value=>{
  if(value===undefined||value===null||value==="") return null;
  const n=Number(String(value).replace(/,/g,""));
  return Number.isFinite(n)?n:null;
};

const result=(check,field,status,value,expected,detail,extra={})=>({
  check,field,status,value:value??"",expected:expected??"",detail,...extra
});

function findSourceLine(doc,line){
  const sourceLines=Array.isArray(doc?.extraction?.lines)?doc.extraction.lines:[];
  const key=value=>String(value??"").trim().toLowerCase();
  const hs=key(line?.hsCode);
  const description=key(line?.description);
  return sourceLines.find(x=>key(x?.hsCode)===hs&&key(x?.description)===description)
    ||sourceLines.find(x=>key(x?.description)===description)
    ||null;
}

function getWorkingLines(data){
  const invoiceLines=Array.isArray(data?.lines)?data.lines:[];
  const selected=data?.weightSourceDecision?.source;
  const docs=Array.isArray(data?.documents)?data.documents:[];
  const packing=docs.find(d=>/packing/i.test(d?.filename||""))||docs.find(d=>d?.extraction?.documentType==="packing_list");
  return invoiceLines.map((line,index)=>{
    const sourceLine=selected==="packing_list"&&packing?findSourceLine(packing,line):null;
    return {
      ...line,
      _lineNumber:line?.lineNo||index+1,
      _netMass:sourceLine?.netMassKg??line?.netMassKg??line?.weightKg,
      _grossMass:sourceLine?.grossMassKg??line?.grossMassKg??line?.weightKg,
      _weightSource:sourceLine?"Packing List":"Commercial Invoice"
    };
  });
}

export function validateStandardCustomsRecord(data={}){
  const checks=[];
  const fail=(...args)=>checks.push(result(...args));
  const pass=(...args)=>checks.push(result(...args));
  const review=(...args)=>checks.push(result(...args));

  const countryExport=text(data.countryOfExport||data.exporterCountryIso).toUpperCase();
  const destination=text(data.sourceCountryOfDestination||data.countryOfDestination).toUpperCase();
  const currency=text(data.currency).toUpperCase();
  const invoiceNumber=text(data.invoiceNumber);
  const exporter=text(data.exporterName||data.exporter);
  const consignee=text(data.consigneeName||data.consignee);
  const totalAmount=numberValue(data.totalInvoicedAmount??data.totalAmountInvoiced);
  const totalGross=numberValue(data.totalGrossWeight);
  const totalPackages=numberValue(data.totalPackages);

  const requiredHeader=[
    ["Invoice number","invoiceNumber",invoiceNumber,"non-empty invoice/reference number"],
    ["Exporter","exporterName",exporter,"non-empty exporter"],
    ["Consignee","consigneeName",consignee,"non-empty consignee"],
    ["Country of export","countryOfExport",countryExport,"ISO 3166-1 alpha-2 code"],
    ["Country of destination","sourceCountryOfDestination",destination,"ISO 3166-1 alpha-2 code"],
    ["Invoice currency","currency",currency,"3-letter ISO currency code"],
    ["Total amount invoiced","totalInvoicedAmount",totalAmount,"numeric non-negative amount"],
    ["Total gross mass","totalGrossWeight",totalGross,"numeric non-negative kg"]
  ];

  requiredHeader.forEach(([label,field,value,expected])=>{
    if(!hasValue(value)){
      fail(label,field,"fail",value,expected,"Required customs header value is missing from the working record.");
    }else if(["countryOfExport","sourceCountryOfDestination"].includes(field)&&!ISO2.test(String(value).toUpperCase())){
      fail(label,field,"fail",value,expected,"Country code must be a two-letter ISO 3166-1 alpha-2 value.");
    }else if(field==="currency"&&!CURRENCY.test(String(value).toUpperCase())){
      fail(label,field,"fail",value,expected,"Currency must be a three-letter ISO code.");
    }else if(["totalInvoicedAmount","totalGrossWeight"].includes(field)&&numberValue(value)===null){
      fail(label,field,"fail",value,expected,"Value must be numeric.");
    }else if(["totalInvoicedAmount","totalGrossWeight"].includes(field)&&numberValue(value)<0){
      fail(label,field,"fail",value,expected,"Value cannot be negative.");
    }else{
      pass(label,field,"pass",value,expected,"Working customs value is present and valid.");
    }
  });

  const exporterCountry=text(data.exporterCountryIso).toUpperCase();
  const consigneeCountry=text(data.consigneeCountryIso).toUpperCase();
  [["Exporter country ISO","exporterCountryIso",exporterCountry],["Consignee country ISO","consigneeCountryIso",consigneeCountry]].forEach(([label,field,value])=>{
    if(!hasValue(value)) review(label,field,"review",value,"two-letter ISO code","Country ISO was not extracted; confirm the source document before posting.");
    else if(!ISO2.test(value)) fail(label,field,"fail",value,"two-letter ISO code","Country ISO must contain exactly two letters.");
    else pass(label,field,"pass",value,"two-letter ISO code","Country ISO format is valid.");
  });

  const exporterAddressLine1=text(data.exporterAddressLine1);
  const exporterPostcode=text(data.exporterPostcode);
  const exporterCity=text(data.exporterCity);
  const exporterCountry=text(data.exporterCountryIso).toUpperCase();
  [["Exporter address line 1","exporterAddressLine1",exporterAddressLine1],["Exporter postcode/ZIP","exporterPostcode",exporterPostcode],["Exporter city","exporterCity",exporterCity],["Exporter country ISO","exporterCountryIso",exporterCountry]].forEach(([label,field,value])=>{
    if(!hasValue(value)) fail(label,field,"fail",value,"extracted address component","Exporter address component is missing.");
    else pass(label,field,"pass",value,"extracted address component","Exporter address component is present.");
  });

  const isGBExporter=countryExport==="GB"||exporterCountry==="GB";
  const exporterEori=text(data.exporterEoriNo);
  if(isGBExporter){
    if(!exporterEori) fail("GB exporter EORI","exporterEoriNo","fail",exporterEori,"GB EORI number","GB exporter detected but no EORI was extracted.");
    else if(!/^GB\d{9,15}$/i.test(exporterEori.replace(/\s+/g,""))) fail("GB exporter EORI","exporterEoriNo","fail",exporterEori,"GB followed by 9-15 digits","GB EORI format is invalid.");
    else pass("GB exporter EORI","exporterEoriNo","pass",exporterEori,"GB followed by 9-15 digits","GB EORI format is valid.");
  }else{
    review("GB exporter EORI","exporterEoriNo","not_applicable",exporterEori,"only required for GB exporter","Exporter is not identified as GB.");
  }

  if(totalPackages!==null){
    if(totalPackages<0||!Number.isInteger(totalPackages)) fail("Total packages","totalPackages", "fail",totalPackages,"non-negative whole number","Total packages must be a non-negative whole number.");
    else pass("Total packages","totalPackages","pass",totalPackages,"non-negative whole number","Total packages value is valid.");
  }

  const lines=getWorkingLines(data);
  if(!lines.length){
    fail("Goods lines","lines","fail",0,"at least one goods line","No goods lines are available in the working customs record.");
  }

  const seen=new Set();
  let lineNet=0;
  let lineGross=0;
  let lineValue=0;
  let allLineValuesNumeric=true;

  lines.forEach((line,index)=>{
    const lineNo=numberValue(line._lineNumber);
    const prefix="Line "+(index+1);
    const description=text(line.description);
    const hs=text(line.hsCode).replace(/\s+/g,"");
    const origin=text(line.sourceCountryCode||line.countryOfOrigin).toUpperCase();
    const quantity=numberValue(line.quantity);
    const amount=numberValue(line.totalValue??line.lineValue??line.unitValue);
    const lineCurrency=text(line.currency||currency).toUpperCase();
    const net=numberValue(line._netMass);
    const gross=numberValue(line._grossMass);

    if(lineNo===null||!Number.isInteger(lineNo)||lineNo<1) fail(prefix+" number","lineNo","fail",line._lineNumber,"positive whole number","Goods line number must be a positive whole number.",{lineNumber:index+1});
    else if(seen.has(lineNo)) fail(prefix+" number","lineNo","fail",lineNo,"unique sequential line number","Goods line number is duplicated.",{lineNumber:index+1});
    else {seen.add(lineNo); pass(prefix+" number","lineNo","pass",lineNo,"unique positive line number","Goods line number is valid.",{lineNumber:index+1});}

    if(!description) fail(prefix+" description","description","fail",description,"non-empty description","Goods description is missing.",{lineNumber:index+1});
    else pass(prefix+" description","description","pass",description,"non-empty description","Goods description is present.",{lineNumber:index+1});

    if(!hs) fail(prefix+" HS code","hsCode","fail",hs,"HS/commodity code","HS code is missing.",{lineNumber:index+1});
    else if(!HS.test(hs)) fail(prefix+" HS code","hsCode","fail",hs,"4-10 numeric digits","HS code contains invalid characters or length.",{lineNumber:index+1});
    else pass(prefix+" HS code","hsCode","pass",hs,"4-10 numeric digits","HS code format is valid.",{lineNumber:index+1});

    if(!origin) fail(prefix+" country of origin","sourceCountryCode","fail",origin,"two-letter ISO code","Country of origin is missing.",{lineNumber:index+1});
    else if(!ISO2.test(origin)) fail(prefix+" country of origin","sourceCountryCode","fail",origin,"two-letter ISO code","Country of origin must be a two-letter ISO code.",{lineNumber:index+1});
    else pass(prefix+" country of origin","sourceCountryCode","pass",origin,"two-letter ISO code","Country of origin format is valid.",{lineNumber:index+1});

    if(quantity===null||quantity<0) fail(prefix+" quantity","quantity","fail",line.quantity,"non-negative number","Quantity is missing or invalid.",{lineNumber:index+1});
    else pass(prefix+" quantity","quantity","pass",quantity,"non-negative number","Quantity is valid.",{lineNumber:index+1});

    if(amount===null){
      allLineValuesNumeric=false;
      fail(prefix+" item amount","itemPrice_SAD42","fail",line.totalValue??line.lineValue??line.unitValue,"numeric line amount","Line monetary value is missing. A line amount is required for the working customs record.",{lineNumber:index+1});
    }else if(amount<0){
      allLineValuesNumeric=false;
      fail(prefix+" item amount","itemPrice_SAD42","fail",amount,"non-negative line amount","Line monetary value cannot be negative.",{lineNumber:index+1});
    }else{
      lineValue+=amount;
      pass(prefix+" item amount","itemPrice_SAD42","pass",amount,"numeric line amount","Line monetary value is present and valid.",{lineNumber:index+1});
    }

    if(!lineCurrency) fail(prefix+" item currency","itemPrice_SAD42Currency","fail",line.currency,"3-letter ISO currency code","Line currency is missing.",{lineNumber:index+1});
    else if(!CURRENCY.test(lineCurrency)) fail(prefix+" item currency","itemPrice_SAD42Currency","fail",lineCurrency,"3-letter ISO currency code","Line currency must be a three-letter ISO code.",{lineNumber:index+1});
    else if(currency&&lineCurrency!==currency) fail(prefix+" item currency","itemPrice_SAD42Currency","fail",lineCurrency,currency,"Line currency does not match the header invoice currency.",{lineNumber:index+1});
    else pass(prefix+" item currency","itemPrice_SAD42Currency","pass",lineCurrency,"3-letter ISO currency code","Line currency is valid.",{lineNumber:index+1});

    if(net===null) fail(prefix+" net mass","netMass_SAD38","fail",line._netMass,"non-negative kg value","Working net mass is missing.",{lineNumber:index+1});
    else if(net<0) fail(prefix+" net mass","netMass_SAD38","fail",net,"non-negative kg value","Working net mass cannot be negative.",{lineNumber:index+1});
    else {lineNet+=net;pass(prefix+" net mass","netMass_SAD38","pass",net,"non-negative kg value","Working net mass is valid.",{lineNumber:index+1});}

    if(gross===null) fail(prefix+" gross mass","grossMass_SAD35","fail",line._grossMass,"non-negative kg value","Working gross mass is missing.",{lineNumber:index+1});
    else if(gross<0) fail(prefix+" gross mass","grossMass_SAD35","fail",gross,"non-negative kg value","Working gross mass cannot be negative.",{lineNumber:index+1});
    else {lineGross+=gross;pass(prefix+" gross mass","grossMass_SAD35","pass",gross,"non-negative kg value","Working gross mass is valid.",{lineNumber:index+1});}

    if(net!==null&&gross!==null&&net>gross) fail(prefix+" weight relationship","netMass_SAD38/grossMass_SAD35","fail",`${net}/${gross}`,"net mass <= gross mass","Net mass cannot exceed gross mass.",{lineNumber:index+1});
    else if(net!==null&&gross!==null) pass(prefix+" weight relationship","netMass_SAD38/grossMass_SAD35","pass",`${net}/${gross}`,"net mass <= gross mass","Net/gross relationship is valid.",{lineNumber:index+1});
  });

  if(lines.length&&lines.every((line,index)=>numberValue(line._lineNumber)===index+1)){
    pass("Goods line sequence","sequentialNo_SAD32","pass",lines.map(x=>x._lineNumber).join(", "),"1..n sequential numbering","Goods lines are sequential.");
  }

  if(lines.length&&numberValue(data.totalGrossWeight)!==null){
    const difference=Math.abs(lineGross-numberValue(data.totalGrossWeight));
    if(difference>0.01) fail("Gross mass total reconciliation","totalGrossWeight","fail",`${lineGross} vs ${data.totalGrossWeight}`,"line gross total matches header total","Working line gross mass total does not reconcile to the header gross mass.",{expected:data.totalGrossWeight});
    else pass("Gross mass total reconciliation","totalGrossWeight","pass",lineGross,"line gross total matches header total","Working line gross mass total reconciles to the header gross mass.");
  }

  const invoiceTotal=numberValue(data.totalInvoicedAmount??data.totalAmountInvoiced);
  if(invoiceTotal!==null&&allLineValuesNumeric){
    const difference=Math.abs(lineValue-invoiceTotal);
    if(difference>0.01) fail("Invoice amount reconciliation","totalInvoicedAmount","fail",`${lineValue} vs ${invoiceTotal}`,"line amounts reconcile to invoice total","Sum of working line amounts does not reconcile to the invoice total.",{expected:invoiceTotal});
    else pass("Invoice amount reconciliation","totalInvoicedAmount","pass",lineValue,"line amounts reconcile to invoice total","Working line amounts reconcile to the invoice total.");
  }

  return {
    checks,
    summary:{
      total:checks.length,
      pass:checks.filter(x=>x.status==="pass").length,
      fail:checks.filter(x=>x.status==="fail").length,
      review:checks.filter(x=>x.status==="review").length,
      notApplicable:checks.filter(x=>x.status==="not_applicable").length
    }
  };
}

export default validateStandardCustomsRecord;
