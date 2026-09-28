export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured in Vercel." });
  }

  try {
    const { fileData, filename, mimeType } = req.body || {};
    if (!fileData || !filename) {
      return res.status(400).json({ error: "fileData and filename are required." });
    }

    const isImage = /^image\//i.test(mimeType || "");

    const content = [
      {
        type: "input_text",
        text: `You are the primary document extraction engine for a UK customs brokerage Intelligent Document Processing platform.

Your job is accurate source extraction, NOT guessing and NOT customer-rule application.

1. Identify the document type.
2. Read the complete document, including headers, footers, tables and totals.
3. Extract only values supported by the document. Never invent, infer or silently correct a missing value.
4. Preserve the source representation where useful, but return numeric customs values as numbers. For exporterAddress and consigneeAddress, capture the COMPLETE visible address block exactly as shown, including every street/address line, town/city, postcode/ZIP, country and any other address text. Preserve line breaks with \\n where appropriate; never truncate an address to only the first line. For each exporter and consignee, also split the address into addressLine1, postcode/ZIP, city and country ISO code when those components are explicitly present. Analyse the complete address block and its visual/layout context before splitting it: distinguish the premises/street/address line from the town or city, even when the address is shown as multiple comma-separated or line-separated fragments. A business/industrial estate or street name is not automatically the city. If the document explicitly shows a town/city as part of the address, place that value in the city field even when it appears on the same line or immediately before the postcode. For example, if the visible block is "Unit 8, Maldon Industrial Park, CM9 6SN, United Kingdom", identify "Maldon" as the city only if the document/layout supports it; otherwise leave city null rather than guessing. Keep postcode/ZIP and country separate. Do not invent missing components. Country ISO codes must be two-letter ISO 3166-1 alpha-2 codes based on the document; if the country is not explicitly identifiable, return null. For a GB exporter, perform a dedicated full-document search for the exporter EORI before returning the result. Look in the exporter/company header, address block, tax/registration details, footer, invoice notes and any field labelled EORI, EORI No, EORI Number, Economic Operators Registration and Identification, or similar. If a visibly printed UK EORI is present, copy it into exporterEoriNo with the GB prefix and all digits, but normalise the working value by removing spaces or other visual separators (for example, convert "GB 812 4567 19" to "GB812456719"). Preserve the original visible formatting in the fieldEvidence sourceText and page. Do not remove or alter any meaningful characters beyond visual separators in the EORI working value. Do not mistake a VAT number, company registration number, customer number, invoice number or other identifier for an EORI. If the document is a GB export invoice and no EORI is visibly present anywhere in the document, return null rather than guessing.
5. Capture all line items. Do not merge separate lines.
6. Capture line-level net and gross weight separately when the document provides them. Map the document's NET column to netMassKg and the document's GROSS column to grossMassKg. Never swap these fields. Map the line's extended/total amount to totalValue and the unit price to unitValue. Map the line's country-of-origin/country code to sourceCountryCode. Read the column header immediately above each weight value before assigning it. For example, a value under NET must never be returned as grossMassKg, and a value under GROSS must never be returned as netMassKg. If both columns are present, preserve each independently even when another document uses a different weight allocation.
7. If a value is unclear, return the best supported reading and lower its confidence.
8. If a field is absent, return null.
9. Check arithmetic where possible: line totals versus invoice total, quantities versus packages, and line weights versus document totals.
10. Do NOT apply customer-specific rules, weight apportionment, ISO middleware substitutions, padding of procedure codes, or other downstream transformations. Those happen after extraction.
11. For countries, preserve the document/source code in sourceCountryCode/country fields. Do not convert RS to XS or perform other middleware mappings.
12. Return evidence for important fields. Evidence must describe what was actually visible in the source; do not fabricate quotations.
13. If the document contains multiple invoices or distinct customs references, report them rather than silently choosing one.

The downstream workflow will use this extraction as the canonical source layer before customer strategy, reconciliation and middleware validation.`
      },
      {
        type: isImage ? "input_image" : "input_file",
        ...(isImage
          ? { image_url: fileData, detail: "high" }
          : { file_data: fileData, filename })
      }
    ];

    const nullableString = { type: ["string", "null"] };
    const nullableNumber = { type: ["number", "null"] };

    const evidenceItem = {
      type: "object",
      additionalProperties: false,
      properties: {
        field: { type: "string" },
        value: { type: ["string", "number", "null"] },
        sourceText: { type: ["string", "null"] },
        page: { type: ["number", "null"] },
        confidence: { type: "number" }
      },
      required: ["field", "value", "sourceText", "page", "confidence"]
    };

    const lineSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        lineNo: { type: "number" },
        sourceCountryCode: nullableString,
        marks: nullableString,
        packages: nullableNumber,
        packagingType: nullableString,
        description: nullableString,
        hsCode: nullableString,
        quantity: nullableNumber,
        unitOfMeasure: nullableString,
        netMassKg: nullableNumber,
        grossMassKg: nullableNumber,
        weightKg: nullableNumber,
        unitValue: nullableNumber,
        totalValue: nullableNumber,
        currency: nullableString,
        confidence: { type: "number" },
        evidence: {
          type: "array",
          items: evidenceItem
        }
      },
      required: [
        "lineNo", "sourceCountryCode", "marks", "packages", "packagingType",
        "description", "hsCode", "quantity", "unitOfMeasure", "netMassKg",
        "grossMassKg", "weightKg", "unitValue", "totalValue", "currency",
        "confidence", "evidence"
      ]
    };

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        documentType: {
          type: "string",
          enum: [
            "commercial_invoice",
            "packing_list",
            "cmr",
            "bill_of_lading",
            "certificate_of_origin",
            "customs",
            "supporting",
            "email",
            "unknown"
          ]
        },
        documentTypeConfidence: { type: "number" },
        confidence: { type: "number" },

        invoiceNumber: nullableString,
        invoiceNumbers: {
          type: "array",
          items: { type: "string" }
        },
        exportDate: nullableString,
        airWaybill: nullableString,
        transportReference: nullableString,

        exporter: nullableString,
        exporterAddress: nullableString,
        exporterAddressLine1: nullableString,
        exporterPostcode: nullableString,
        exporterCity: nullableString,
        exporterCountryIso: nullableString,
        exporterVatNo: nullableString,
        exporterEoriNo: nullableString,
        consignee: nullableString,
        consigneeAddress: nullableString,
        consigneeAddressLine1: nullableString,
        consigneePostcode: nullableString,
        consigneeCity: nullableString,
        consigneeCountryIso: nullableString,
        consigneeTaxId: nullableString,
        importer: nullableString,

        countryOfExport: nullableString,
        sourceCountryOfDestination: nullableString,
        reasonForExport: nullableString,
        deliveryTerm: nullableString,
        deliveryTermPlace: nullableString,

        totalPackages: nullableNumber,
        totalNetWeight: nullableNumber,
        totalGrossWeight: nullableNumber,
        currency: nullableString,
        totalInvoiceValue: nullableNumber,
        paymentMethod: nullableString,

        lines: {
          type: "array",
          items: lineSchema
        },

        validationChecks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              check: { type: "string" },
              status: {
                type: "string",
                enum: ["pass", "warning", "fail", "not_applicable"]
              },
              detail: { type: "string" }
            },
            required: ["check", "status", "detail"]
          }
        },

        warnings: {
          type: "array",
          items: { type: "string" }
        },

        fieldEvidence: {
          type: "array",
          items: evidenceItem
        }
      },
      required: [
        "documentType",
        "documentTypeConfidence",
        "confidence",
        "invoiceNumber",
        "invoiceNumbers",
        "exportDate",
        "airWaybill",
        "transportReference",
        "exporter",
        "exporterAddress",
        "exporterAddressLine1",
        "exporterPostcode",
        "exporterCity",
        "exporterCountryIso",
        "exporterVatNo",
        "exporterEoriNo",
        "consignee",
        "consigneeAddress",
        "consigneeAddressLine1",
        "consigneePostcode",
        "consigneeCity",
        "consigneeCountryIso",
        "consigneeTaxId",
        "importer",
        "countryOfExport",
        "sourceCountryOfDestination",
        "reasonForExport",
        "deliveryTerm",
        "deliveryTermPlace",
        "totalPackages",
        "totalNetWeight",
        "totalGrossWeight",
        "currency",
        "totalInvoiceValue",
        "paymentMethod",
        "lines",
        "validationChecks",
        "warnings",
        "fieldEvidence"
      ]
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "customs_document_extraction_v2",
            strict: true,
            schema
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "OpenAI extraction failed."
      });
    }

    const textOutput =
      data.output_text ||
      data.output?.flatMap(item => item.content || [])
        .find(item => item.type === "output_text")?.text;

    if (!textOutput) {
      return res.status(502).json({ error: "No structured extraction was returned." });
    }

    let extraction;
    try {
      extraction = JSON.parse(textOutput);
    } catch {
      return res.status(502).json({ error: "The extraction engine returned invalid structured data." });
    }

    const deriveCityFromAddress=(address,addressLine1,postcode,country)=>{
      if(!address||!postcode)return null;
      const text=String(address).replace(/\r/g,"").trim();
      const line1=String(addressLine1||"").trim();
      const candidates=[line1,...text.split(/\n|,/).map(x=>x.trim())].filter(Boolean);
      for(const candidate of candidates){
        const compact=candidate.replace(/\s+/g," ").trim();
        const industrial=compact.match(/^([A-Za-z][A-Za-z .'-]*?)\s+(?:Industrial|Business)\s+(?:Park|Estate)\b/i);
        if(industrial?.[1]){
          const city=industrial[1].trim().replace(/^(?:Unit|Suite|Building|Warehouse|Office)\s+\d+[,:-]?\s*/i,"").trim();
          if(city&&city.length>1)return city;
        }
      }
      return null;
    };
    if(!extraction.exporterCity){
      const derivedCity=deriveCityFromAddress(extraction.exporterAddress,extraction.exporterAddressLine1,extraction.exporterPostcode,extraction.exporterCountryIso);
      if(derivedCity)extraction.exporterCity=derivedCity;
    }
    if(!extraction.consigneeCity){
      const derivedCity=deriveCityFromAddress(extraction.consigneeAddress,extraction.consigneeAddressLine1,extraction.consigneePostcode,extraction.consigneeCountryIso);
      if(derivedCity)extraction.consigneeCity=derivedCity;
    }

    return res.status(200).json({
      extraction,
      extractionVersion: "v2",
      source: {
        filename,
        mimeType: mimeType || null
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Extraction failed."
    });
  }
}