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
