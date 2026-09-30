# Customs IDP Outlook.com setup

## Microsoft app registration

Use the existing **Customs IDP Email Intake** app registration.

Configured values:
- Account type: Personal Microsoft accounts
- Redirect URI: https://customs-idp.vercel.app/api/outlook/callback
- Microsoft Graph delegated permissions: User.Read, Mail.Read

## Vercel environment variables

Add these to the Customs IDP Vercel project:

- OUTLOOK_CLIENT_ID = Microsoft Application (client) ID
- OUTLOOK_CLIENT_SECRET = the client secret value created in Entra
- OUTLOOK_REDIRECT_URI = https://customs-idp.vercel.app/api/outlook/callback
- OUTLOOK_TOKEN_ENCRYPTION_KEY = base64-encoded 32-byte random key

The encryption key protects the Microsoft refresh token stored in Supabase. Never commit it to GitHub.

## Supabase table

Run:

```sql
create table if not exists public.outlook_connections (
  id text primary key,
  email text not null unique,
  display_name text,
  refresh_token text not null,
  scopes text,
  status text not null default 'connected',
  subscription_id text,
  subscription_expires_at timestamptz,
  client_state text,
  updated_at timestamptz not null default now()
);

alter table public.outlook_connections enable row level security;
```

The application accesses this table with the Supabase service role key from Vercel.

## Test mailbox routing

For the first free test, route your Outlook.com address to one test customer. In Vercel set:

```text
CUSTOMER_EMAIL_ROUTING_JSON={"wingroveliam@outlook.com":{"customer":"Acme Components Ltd"}}
CUSTOMER_EMAIL_STRATEGIES_JSON={"Acme Components Ltd":{"emailFields":[]}}
```

You can change the customer later without changing the Microsoft connection.

## Connection flow

1. Authenticated Customs IDP user requests `/api/outlook/connect`.
2. Microsoft login/consent is shown.
3. Microsoft redirects to `/api/outlook/callback`.
4. The callback exchanges the code for access/refresh tokens.
5. The refresh token is encrypted before storage.
6. The connected mailbox can then be used by the Outlook Graph ingestion worker.

## Security

- Do not commit the client secret, refresh token or encryption key.
- Only delegated `Mail.Read` is requested for mailbox access.
- OAuth state is signed and expires after 10 minutes.
- Refresh tokens are encrypted at rest before being stored.


## Vercel setup checklist

After the code is deployed:

1. Add `OUTLOOK_CLIENT_ID` using the Application (client) ID shown in Entra.
2. Add `OUTLOOK_CLIENT_SECRET` using the secret **value** you just created. Never put this in GitHub.
3. Add `OUTLOOK_REDIRECT_URI` as `https://customs-idp.vercel.app/api/outlook/callback`.
4. Generate a random 32-byte value and base64-encode it for `OUTLOOK_TOKEN_ENCRYPTION_KEY`. For example, in a terminal:
   `openssl rand -base64 32`
5. Keep the existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_INGEST_SECRET`, `IDP_AUTH_SECRET` and `OPENAI_API_KEY`.
6. Redeploy after changing environment variables.

The Settings page will then show **Connect Outlook**. Authorise the Microsoft account once. The callback creates the Graph Inbox subscription automatically. The daily Vercel cron renews that subscription.
