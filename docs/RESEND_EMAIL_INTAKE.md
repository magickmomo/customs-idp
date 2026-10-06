# Resend inbound email intake

The configured inbound address is `test@fenauonto.resend.app`. Resend sends an
`email.received` webhook to the application; the application verifies the Svix
signature, retrieves the received message and attachments from Resend, and then
passes the normalized message through the existing `/api/email-ingest` flow.

## Deployment configuration

Set these server-only environment variables in Vercel (and in local `.env` when
testing):

```text
RESEND_INBOUND_ADDRESS=test@fenauonto.resend.app
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
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

Resend may retry webhook delivery. The existing email-ingest idempotency claim
uses the Resend message ID/ticket, so retries do not create a second pack.

