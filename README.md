# Customs IDP

A standalone React/Vite prototype for the Customs Intelligent Data Processing platform.

## Current scope

- Operations dashboard with pack and invoice metrics
- Document inbox and pack queue
- Pack review workspace
- Extracted invoice positions and confidence
- Customer-specific extraction strategy view
- AI extraction/validation agent interface
- Middleware JSON preview using the Customs IDP field contract
- Processing settings
- Responsive UI

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Next implementation phase

Connect the UI to production services for document ingestion, OCR/ML extraction, customer rule persistence, authentication, mailbox ingestion and middleware delivery. The current sample data is intentionally local so the interface can be developed independently of Base44.