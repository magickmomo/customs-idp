import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { handleResendWebhook, verifyResendSignature } from "../src/server/api/resend-webhook.js";

function signedHeaders({ secret, rawBody, id = "msg_test", timestamp = Math.floor(Date.now() / 1000) }) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  return {
    "svix-id": id,
    "svix-timestamp": String(timestamp),
    "svix-signature": `v1,${signature}`
  };
}

async function withResendEnv(callback) {
  const original = {
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_INGEST_SECRET: process.env.EMAIL_INGEST_SECRET,
    RESEND_INBOUND_ADDRESS: process.env.RESEND_INBOUND_ADDRESS
  };
  const secret = `whsec_${Buffer.from("resend-test-secret").toString("base64")}`;

  process.env.RESEND_WEBHOOK_SECRET = secret;
  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_INGEST_SECRET = "email-ingest-test";
  process.env.RESEND_INBOUND_ADDRESS = "test@example.resend.app";

  try {
    return await callback({ secret });
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("verifyResendSignature accepts a valid Svix-style signature", () => {
  const secret = `whsec_${Buffer.from("resend-test-secret").toString("base64")}`;
  const rawBody = JSON.stringify({ type: "email.received", data: { email_id: "email_123" } });
  const timestamp = Math.floor(Date.now() / 1000);

  const result = verifyResendSignature({
    headers: signedHeaders({ secret, rawBody, timestamp }),
    rawBody,
    secret,
    now: timestamp * 1000
  });

  assert.deepEqual(result, { ok: true });
});

test("verifyResendSignature rejects a modified body", () => {
  const secret = `whsec_${Buffer.from("resend-test-secret").toString("base64")}`;
  const rawBody = JSON.stringify({ type: "email.received", data: { email_id: "email_123" } });
  const headers = signedHeaders({ secret, rawBody });

  const result = verifyResendSignature({
    headers,
    rawBody: rawBody + " ",
    secret
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /Invalid Resend webhook signature/);
});

test("handleResendWebhook reports missing configuration before processing", async () => {
  const original = {
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_INGEST_SECRET: process.env.EMAIL_INGEST_SECRET
  };

  delete process.env.RESEND_WEBHOOK_SECRET;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_INGEST_SECRET;

  try {
    const response = await handleResendWebhook({
      rawBody: JSON.stringify({ type: "email.received", data: { email_id: "email_123" } })
    });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.stage, "config");
    assert.match(body.error, /RESEND_WEBHOOK_SECRET/);
    assert.match(body.error, /RESEND_API_KEY/);
    assert.match(body.error, /EMAIL_INGEST_SECRET/);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("handleResendWebhook acknowledges a valid email before deferred processing starts", async () => {
  await withResendEnv(async ({ secret }) => {
    const rawBody = JSON.stringify({
      type: "email.received",
      data: {
        email_id: "email_123",
        to: ["test@example.resend.app"],
        from: "sender@example.com",
        subject: "Customs documents"
      }
    });
    let deferred;
    let fetchCalls = 0;

    const response = await handleResendWebhook({
      headers: signedHeaders({ secret, rawBody }),
      rawBody,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("Deferred work should not start before acknowledgement.");
      },
      defer: callback => {
        deferred = callback;
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.accepted, true);
    assert.equal(body.emailId, "email_123");
    assert.equal(fetchCalls, 0);
    assert.equal(typeof deferred, "function");
  });
});

test("deferred Resend processing retrieves the email and attachment then invokes email ingest", async () => {
  await withResendEnv(async ({ secret }) => {
    const rawBody = JSON.stringify({
      created_at: "2026-10-06T06:37:46.000Z",
      type: "email.received",
      data: {
        email_id: "email_123",
        message_id: "<message@example.com>",
        created_at: "2026-10-06T06:37:59.095Z",
        to: ["test@example.resend.app"],
        from: "sender@example.com",
        subject: "Customs documents",
        attachments: [{ filename: "invoice.pdf", content_type: "application/pdf" }]
      }
    });
    const requests = [];
    let ingestRequest;
    let deferred;

    const response = await handleResendWebhook({
      headers: signedHeaders({ secret, rawBody }),
      rawBody,
      fetchImpl: async url => {
        requests.push(String(url));
        if (String(url).endsWith("/emails/receiving/email_123")) {
          return Response.json({
            data: {
              from: "sender@example.com",
              subject: "Customs documents",
              text: "Please process the attached invoice."
            }
          });
        }
        if (String(url).endsWith("/emails/receiving/email_123/attachments")) {
          return Response.json({
            data: [{
              filename: "invoice.pdf",
              content_type: "application/pdf",
              content_base64: "JVBERg==",
              size: 123
            }]
          });
        }
        throw new Error("Unexpected fetch: " + url);
      },
      emailIngestHandler: async (req, res) => {
        ingestRequest = req;
        return res.status(200).json({ ok: true, packId: "PK-EMAIL-1", status: "Processing" });
      },
      defer: callback => {
        deferred = callback;
      }
    });

    assert.equal(response.status, 200);
    assert.equal(typeof deferred, "function");

    await deferred();

    assert.equal(requests.length, 2);
    assert.equal(ingestRequest.method, "POST");
    assert.equal(ingestRequest.headers["x-email-ingest-secret"], "email-ingest-test");
    assert.equal(ingestRequest.body.ticket, "RESEND:email_123");
    assert.equal(ingestRequest.body.messageId, "<message@example.com>");
    assert.equal(ingestRequest.body.text, "Please process the attached invoice.");
    assert.equal(ingestRequest.body.attachments.length, 1);
    assert.equal(ingestRequest.body.attachments[0].filename, "invoice.pdf");
    assert.equal(ingestRequest.body.attachments[0].contentBase64, "JVBERg==");
  });
});

test("invalid webhook signatures are rejected without scheduling deferred work", async () => {
  await withResendEnv(async () => {
    let deferred = false;
    const rawBody = JSON.stringify({ type: "email.received", data: { email_id: "email_123" } });

    const response = await handleResendWebhook({
      headers: {
        "svix-id": "msg_test",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,not-valid"
      },
      rawBody,
      defer: () => {
        deferred = true;
      }
    });

    assert.equal(response.status, 401);
    assert.equal(deferred, false);
  });
});

test("non-email events return immediately without scheduling deferred work", async () => {
  await withResendEnv(async ({ secret }) => {
    let deferred = false;
    const rawBody = JSON.stringify({ type: "email.sent", data: { email_id: "email_123" } });

    const response = await handleResendWebhook({
      headers: signedHeaders({ secret, rawBody }),
      rawBody,
      defer: () => {
        deferred = true;
      }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ignored, true);
    assert.equal(deferred, false);
  });
});
