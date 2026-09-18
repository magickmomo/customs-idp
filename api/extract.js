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
        text: `You are the document extraction engine for a UK customs brokerage IDP platform.

Read the uploaded commercial/customs document carefully. Extract only information actually present in the document. Do not invent values.

Return structured customs data. Preserve document values exactly where possible. For country codes, keep the document's code in sourceCountryCode; do not convert RS to XS or make other middleware mappings during extraction.

For line items, capture packages, packaging type, quantity, unit of measure, weights, currency, unit value, total value, HS code and full goods description.

If a field is missing, return null. If a value is ambiguous, return the best reading and lower the confidence. Validate arithmetic where possible and report any inconsistencies.

The downstream system will later apply customer-specific rules and middleware mappings.`
      },
      {
        type: isImage ? "input_image" : "input_file",
        ...(isImage
          ? { image_url: fileData, detail: "high" }
          : { file_data: fileData, filename })
      }
    ];

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        documentType: { type: "string" },
        confidence: { type: "number" },
        invoiceNumber: { type: ["string", "null"] },
        exportDate: { type: ["string", "null"] },
        airWaybill: { type: ["string", "null"] },
        exporter: { type: ["string", "null"] },
        exporterAddress: { type: ["string", "null"] },
        exporterVatNo: { type: ["string", "null"] },
        consignee: { type: ["string", "null"] },
        consigneeAddress: { type: ["string", "null"] },
        consigneeTaxId: { type: ["string", "null"] },
        importer: { type: ["string", "null"] },
        countryOfExport: { type: ["string", "null"] },
        sourceCountryOfDestination: { type: ["string", "null"] },
        reasonForExport: { type: ["string", "null"] },
        totalPackages: { type: ["number", "null"] },
        totalGrossWeight: { type: ["number", "null"] },
        currency: { type: ["string", "null"] },
        totalInvoiceValue: { type: ["number", "null"] },
        paymentMethod: { type: ["string", "null"] },
        lines: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              lineNo: { type: "number" },
              sourceCountryCode: { type: ["string", "null"] },
              marks: { type: ["string", "null"] },
              packages: { type: ["number", "null"] },
              packagingType: { type: ["string", "null"] },
              description: { type: ["string", "null"] },
              hsCode: { type: ["string", "null"] },
              quantity: { type: ["number", "null"] },
              unitOfMeasure: { type: ["string", "null"] },
              weightKg: { type: ["number", "null"] },
              unitValue: { type: ["number", "null"] },
              totalValue: { type: ["number", "null"] },
              confidence: { type: "number" }
            },
            required: ["lineNo","sourceCountryCode","marks","packages","packagingType","description","hsCode","quantity","unitOfMeasure","weightKg","unitValue","totalValue","confidence"]
          }
        },
        validationChecks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              check: { type: "string" },
              status: { type: "string" },
              detail: { type: "string" }
            },
            required: ["check","status","detail"]
          }
        }
      },
      required: ["documentType","confidence","invoiceNumber","exportDate","airWaybill","exporter","exporterAddress","exporterVatNo","consignee","consigneeAddress","consigneeTaxId","importer","countryOfExport","sourceCountryOfDestination","reasonForExport","totalPackages","totalGrossWeight","currency","totalInvoiceValue","paymentMethod","lines","validationChecks"]
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5",
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "customs_document_extraction",
            strict: true,
            schema
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || "OpenAI extraction failed." });
    }

    const textOutput = data.output?.flatMap(item => item.content || [])
      .find(item => item.type === "output_text")?.text;

    if (!textOutput) {
      return res.status(502).json({ error: "No structured extraction was returned." });
    }

    return res.status(200).json({ extraction: JSON.parse(textOutput) });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Extraction failed." });
  }
}
