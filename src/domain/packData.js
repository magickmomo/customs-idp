import { DEFAULT_ORGANISATION } from "../tenant.js";

export const packs = [
  { organisationId:DEFAULT_ORGANISATION.id, organisationName:DEFAULT_ORGANISATION.name, id:"PK-10482", customer:"Acme Components Ltd", docs:4, status:"Needs review", confidence:91, received:"16 Sep 2026, 15:42", ticket:"TK-88421" },
  { organisationId:DEFAULT_ORGANISATION.id, organisationName:DEFAULT_ORGANISATION.name, id:"PK-10481", customer:"Northstar Manufacturing", docs:7, status:"Processing", confidence:96, received:"16 Sep 2026, 15:38", ticket:"TK-88420" },
  { organisationId:DEFAULT_ORGANISATION.id, organisationName:DEFAULT_ORGANISATION.name, id:"PK-10480", customer:"Bancale Trading", docs:3, status:"Validated", confidence:98, received:"16 Sep 2026, 15:31", ticket:"TK-88419" },
  { organisationId:DEFAULT_ORGANISATION.id, organisationName:DEFAULT_ORGANISATION.name, id:"PK-10479", customer:"Raven Industrial", docs:5, status:"Needs review", confidence:88, received:"16 Sep 2026, 15:12", ticket:"TK-88418" }
];

export const customerStrategies = {
  "Acme Components Ltd": { autoApplyWeightApportionment: false, emailFields: [] },
  "Northstar Manufacturing": { autoApplyWeightApportionment: false, emailFields: [] },
  "Bancale Trading": { autoApplyWeightApportionment: false, emailFields: [] },
  "Raven Industrial": { autoApplyWeightApportionment: false, emailFields: [] }
};

export const customerStrategyStore = { ...customerStrategies };

export const getCustomerStrategy = customer =>
  customerStrategyStore[customer] || { autoApplyWeightApportionment: false, emailFields: [] };

export const customers = [
  {name:"Acme Components Ltd", code:"ACME-001", mailbox:"customs.acme@inbox.example", rules:12, processed:"2,481"},
  {name:"Northstar Manufacturing", code:"NSTM-014", mailbox:"customs.northstar@inbox.example", rules:8, processed:"1,972"},
  {name:"Bancale Trading", code:"BANC-007", mailbox:"customs.bancale@inbox.example", rules:15, processed:"3,108"},
  {name:"Raven Industrial", code:"RAVN-021", mailbox:"customs.raven@inbox.example", rules:6, processed:"1,406"}
];

export const DEFAULT_INBOX_COLUMNS=[{key:"pack",label:"Pack",required:true},{key:"customer",label:"Customer",required:true},{key:"owner",label:"Owner",required:true},{key:"documents",label:"Documents",required:true},{key:"status",label:"Status",required:true},{key:"invoiceNumber",label:"Invoice number"},{key:"export",label:"Export"},{key:"destination",label:"Destination"},{key:"invoiceValue",label:"Invoice value"},{key:"currency",label:"Currency"},{key:"deliveryTerm",label:"Delivery term"},{key:"received",label:"Received"},{key:"validation",label:"Validation"}];

export const sampleLines = [
  {line:1,description:"Oak wooden packaging boxes",hs:"4415 10 00",origin:"HU",qty:24,net:"10.080",gross:"11.420",value:"384.00",confidence:97},
  {line:2,description:"Bancale Legno pallets",hs:"4415 20 90",origin:"IT",qty:6,net:"0.000",gross:"3.180",value:"120.00",confidence:93},
  {line:3,description:"Protective timber spacers",hs:"4415 10 90",origin:"HU",qty:18,net:"7.560",gross:"8.410",value:"216.00",confidence:94}
];


export function normaliseDatabasePack(row){
  const data=row?.extracted_data||null;
  const meta=data?._manager||{};
  const validation=data?._validation||{};
  const rest=data?{...data}:null;
  if(rest){
    delete rest._manager;
    delete rest._validation;
    delete rest._workingRecord;
    delete rest._tenant;
  }
  return {
    ...row,
    organisationId:row?.organisation_id||data?._tenant?.organisationId||DEFAULT_ORGANISATION.id,
    organisationName:data?._tenant?.organisationName||DEFAULT_ORGANISATION.name,
    assignedTo:row?.assigned_to||"Unassigned",
    extractedData:rest&&Object.keys(rest).length?rest:undefined,
    workingRecord:data?._workingRecord,
    email:data?.email||null,
    validationStatus:validation.validationStatus||undefined,
    validationChecks:Array.isArray(validation.validationChecks)?validation.validationChecks:undefined,
    validationSummary:validation.validationSummary||undefined,
    uploadedFiles:Array.isArray(meta.uploadedFiles)?meta.uploadedFiles:undefined,
    processingStartedAt:meta.processingStartedAt||undefined,
    processingCompletedAt:meta.processingCompletedAt||undefined,
    processingError:row?.processing_error||undefined
  };
}

export const normalizeCountryCode=value=>{
  const raw=String(value??"").trim();
  const upper=raw.toUpperCase();
  const map={"UNITED KINGDOM":"GB","GREAT BRITAIN":"GB","UK":"GB","ENGLAND":"GB","SCOTLAND":"GB","WALES":"GB","NORTHERN IRELAND":"GB"};
  return map[upper]||upper;
};


