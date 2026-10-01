# Multi-tenancy foundation

Customs IDP is being evolved toward isolated organisation environments.

## Phase 1

The current application now carries an organisation context on every pack:

- `organisationId`
- `organisationName`

The current prototype uses:

- ID: `demo-organisation`
- Name: `Customs IDP Demo Organisation`

This is intentionally a compatibility layer. Existing packs continue to work and are assigned to the default organisation when they do not yet have tenant metadata.

## Planned tenancy model

```
Organisation
  ├── Users
  ├── Teams
  ├── Customers
  ├── Strategies
  ├── Mailboxes
  ├── Document packs
  └── Audit / processing data
```

The next database phase should move the organisation identifier to a dedicated database column and enforce tenant isolation with API authorization and Supabase Row Level Security. The application must not rely on frontend filtering for tenant security.

## Important

Do not create separate production environments or mailboxes per customer at this stage. The goal is one Customs IDP application with isolated organisation tenants inside it.
