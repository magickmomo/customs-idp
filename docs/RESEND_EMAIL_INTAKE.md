# Resend inbound email intake

The configured inbound address is `test@fenauonto.resend.app`. Resend sends an
`email.received` webhook to the application. The application verifies the Svix
signature and durably inserts an intake job before acknowledging the webhook.
A scheduled worker retrieves the message and attachments, invokes the shared
email processing pipeline, and retries recoverable failures.

## Deployment configuration

Set these server-only environment variables in Vercel (and in local `.env` when
testing):

```text
RESEND_INBOUND_ADDRESS=test@fenauonto.resend.app
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
CRON_SECRET=...
# Required when more than one organisation receives Resend email:
RESEND_INBOUND_ROUTING_JSON={"test@fenauonto.resend.app":{"organisationId":"demo-organisation"}}
```

The API key and webhook secret are credentials. Do not commit them or include
them in issue reports/chat messages.

## Resend dashboard

1. Open Receiving Emails and confirm `test@fenauonto.resend.app` is active.
2. Create a webhook pointing to
   `https://<deployment>/api/resend/webhook`.
3. Subscribe to `email.received` and copy the generated signing secret into
   `RESEND_WEBHOOK_SECRET`.
4. Send a test email with a commercial invoice attachment.

Apply `supabase/migrations/20261009090000_email_ingest_jobs.sql` before enabling
the webhook. The production deployment must enable the `/api/email-jobs/process`
Vercel cron. It claims jobs atomically and retries them with bounded backoff.

Managers can inspect and retry failed intake jobs from Settings. A webhook is
only acknowledged after its job exists; if queue persistence fails, the endpoint
returns an error so Resend can retry delivery.

Resend may retry webhook delivery. The existing email-ingest idempotency claim
uses the Resend message ID/ticket, so retries do not create a second pack.
