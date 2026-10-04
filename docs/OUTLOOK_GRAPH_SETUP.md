# Customs IDP Outlook setup

## Microsoft app registration

Use the existing **Customs IDP Email Intake** app registration.

Configured values:
- Account type: Personal Microsoft accounts and organisational accounts
- Redirect URI: the value of `OUTLOOK_REDIRECT_URI` followed by `/api/outlook/callback`
- Microsoft Graph delegated permissions: User.Read, Mail.Read

The OAuth redirect and Graph webhook use different URLs. For local testing, keep the OAuth redirect local and configure the webhook URL to the deployed public endpoint:

```text
APP_URL=http://localhost:3000
OUTLOOK_REDIRECT_URI=http://localhost:3000/api/outlook/callback
OUTLOOK_WEBHOOK_URL=https://customs-idp.vercel.app/api/outlook/webhook
```

## Vercel environment variables

Add these to the Customs IDP Vercel project:

- OUTLOOK_CLIENT_ID = Microsoft Application (client) ID
- OUTLOOK_CLIENT_SECRET = the client secret value created in Entra
- OUTLOOK_REDIRECT_URI = your configured deployment URL followed by `/api/outlook/callback`
- OUTLOOK_WEBHOOK_URL = the public URL Microsoft Graph uses for notifications, followed by `/api/outlook/webhook`
- OUTLOOK_TOKEN_ENCRYPTION_KEY = base64-encoded 32-byte random key
- CRON_SECRET = a long random value used to authenticate renewal and queue-worker requests

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
3. Add `OUTLOOK_REDIRECT_URI` as your configured deployment URL followed by `/api/outlook/callback`.
4. Add `OUTLOOK_WEBHOOK_URL` as the public deployment URL followed by `/api/outlook/webhook`.
5. Generate a random 32-byte value and base64-encode it for `OUTLOOK_TOKEN_ENCRYPTION_KEY`. For example, in a terminal:
   `openssl rand -base64 32`
6. Keep the existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EMAIL_INGEST_SECRET`, `IDP_AUTH_SECRET` and `OPENAI_API_KEY`.
7. Redeploy after changing environment variables.

The Settings page will then show **Connect Outlook**. Authorise the Microsoft account once. The callback creates the Graph Inbox subscription automatically. The daily Vercel cron renews that subscription. If renewal fails, use **Renew subscription** in Settings to renew the existing Graph subscription, or recreate it if Graph has already removed it. This uses the stored Outlook connection and does not require Microsoft sign-in. **Scan existing emails** queues a mailbox scan and is separate from renewal; **Sign in again** repeats Microsoft authorisation if the stored token no longer works.

## Queue worker schedule

The durable queue worker is available at:

```text
POST {APP_URL}/api/outlook?action=process-webhook
Authorization: Bearer {CRON_SECRET}
```

Invoke it once per minute from a trusted scheduler. Vercel Hobby only permits cron jobs once per day, so the minute worker is intentionally not included in `vercel.json`; use Supabase Cron, GitHub Actions, or another external scheduler. On Vercel Pro, the worker can instead be added to `vercel.json` with the schedule `* * * * *`.

Manual Sync and webhook notifications both remain queued until this worker runs. Keep `APP_URL` set to the active deployment URL and use the same `CRON_SECRET` in the scheduler and Vercel environment.

### Restore the worker on Vercel Hobby with Supabase Cron

Enable the `pg_cron`, `pg_net`, and Vault extensions in the Supabase project. Set `CRON_SECRET` in the Vercel project for this fork's test deployment and redeploy. In the Supabase SQL Editor, replace the secret placeholder below and run these commands once. The example app URL is this fork's rosy test deployment; do not use localhost or another project's URL.

```sql
select vault.create_secret('https://customs-idp-rosy.vercel.app', 'outlook_worker_app_url');
select vault.create_secret('REPLACE_WITH_THE_SAME_VALUE_AS_VERCEL_CRON_SECRET', 'CRON_SECRET');
```

Then schedule the existing worker. The named schedule can be updated by unscheduling it before recreating it.

```sql
select cron.schedule(
  'outlook-queue-worker',
  '* * * * *',
  $worker$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'outlook_worker_app_url') || '/api/outlook?action=process-webhook',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $worker$
);
```

Verify the schedule and its executions in the Supabase Cron dashboard or query `cron.job` and `cron.job_run_details`. A successful HTTP request is only the first check: click **Scan existing emails** in Settings and confirm its status progresses from **queued** to **running** to **completed**. Inspect Vercel logs for `/api/outlook?action=process-webhook` and the `outlook_sync_runs` and `outlook_webhook_events` rows if it fails. This worker processes events sequentially, so a large mailbox or slow document extraction may exceed the Vercel function duration; test with one matching email first.
