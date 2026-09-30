# Microsoft 365 email intake

Customs IDP email intake is designed to sit behind Microsoft 365 / Outlook. A Microsoft 365 automation should POST a normalised email payload to `/api/email-ingest` with the `x-email-ingest-secret` header.

## Vercel environment variables
- `EMAIL_INGEST_SECRET` — secret shared only with the Microsoft 365 automation.
- `CUSTOMER_EMAIL_ROUTING_JSON` — recipient-to-customer routing, e.g. `{"acme@customsidp.co.uk":{"customer":"Acme Components Ltd"}}`.
- `CUSTOMER_EMAIL_STRATEGIES_JSON` — optional configured email fields per customer.
- Existing `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` remain required.

## Normalised payload
```json
{
  "to": "acme@customsidp.co.uk",
  "from": "customer@example.com",
  "subject": "Documents for shipment 12345",
  "text": "Please process the attached invoice and packing list.",
  "messageId": "<unique-message-id>",
  "receivedAt": "2026-09-30T18:00:00Z",
  "attachments": [{
    "filename": "invoice.pdf",
    "mimeType": "application/pdf",
    "contentBase64": "..."
  }]
}
```

The endpoint routes the recipient to a customer, extracts configured email fields, sends each attachment through the existing Document Extraction Agent, keeps each source extraction separate, and creates a Review pack. Duplicate Message-IDs are ignored.

## Microsoft 365 connection
Microsoft 365 / Outlook handles mailbox access. The automation should watch the intake mailbox, download attachment content, build the payload above, and POST it to `/api/email-ingest`. Keep the ingestion secret in secure automation configuration.

The application endpoint is provider-neutral so the mailbox layer can be changed later without changing the Customs IDP processing architecture.