import crypto from "crypto";
import emailIngest from "./email-ingest.js";
import { runLegacyHandler } from "../nextLegacyAdapter.js";

const RESEND_API = "https://api.resend.com";
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/** Handle Resend's email.received webhook and adapt it to email-ingest. */
export async function handleResendWebhook({ method = "POST", headers = {}, rawBody = "", fetchImpl = fetch } = {}) {
  if (method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

  const missing = requiredConfiguration();
  if (missing.length) {
    return Response.json(
      { error: `Missing Resend inbound configuration: ${missing.join(", ")}`, stage: "config" },
      { status: 500 }
    );
  }

  const verification = verifyResendSignature({
    headers,
    rawBody,
    secret: process.env.RESEND_WEBHOOK_SECRET
  });
  if (!verification.ok) {
    return Response.json(
      { error: verification.error, stage: "verify" },
      { status: svixStatus(verification.error) }
    );
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON webhook payload.", stage: "parse" }, { status: 400 });
  }

  if (event?.type !== "email.received") {
    return Response.json({ ok: true, ignored: true, type: event?.type || null });
  }

  const emailId = String(event?.data?.email_id || "").trim();
  if (!emailId) {
    return Response.json(
      { error: "email.received is missing data.email_id.", stage: "parse" },
      { status: 400 }
    );
  }

  let email;
  try {
    email = await getReceivedEmail(emailId, fetchImpl);
  } catch (error) {
    return integrationError("retrieve-email", error);
  }

  let attachments;
  try {
    attachments = await getReceivedAttachments(emailId, event?.data?.attachments || [], fetchImpl);
  } catch (error) {
    return integrationError("retrieve-attachments", error);
  }

  const body = toEmailIngestPayload(event, email, attachments);

  try {
    const response = await runLegacyHandler(emailIngest, {
      method: "POST",
      headers: { "x-email-ingest-secret": process.env.EMAIL_INGEST_SECRET },
      body
    });

    if (!response.ok) {
      const upstreamBody = await response.clone().text().catch(() => "");
      console.error("Resend email-ingest rejected inbound message", {
        emailId,
        status: response.status,
        body: upstreamBody
      });
      return Response.json(
        {
          error: "Email ingestion rejected the Resend message.",
          stage: "email-ingest",
          upstreamStatus: response.status,
          upstreamBody: upstreamBody.slice(0, 1000)
        },
        { status: response.status }
      );
    }

    return response;
  } catch (error) {
    return integrationError("email-ingest", error);
  }
}

export function verifyResendSignature({ headers = {}, rawBody = "", secret, now = Date.now() } = {}) {
  const get = name => {
    if (typeof headers?.get === "function") return headers.get(name) || "";
    return headers[name] || headers[name.toLowerCase()] || "";
  };

  const id = String(get("svix-id")).trim();
  const timestamp = String(get("svix-timestamp")).trim();
  const signature = String(get("svix-signature")).trim();

  if (!id || !timestamp || !signature) {
    return { ok: false, error: "Missing Resend webhook signature headers." };
  }

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now - seconds * 1000) > MAX_TIMESTAMP_AGE_MS) {
    return { ok: false, error: "Expired Resend webhook signature." };
  }

  const encodedSecret = String(secret || "").replace(/^whsec_/, "");
  if (!encodedSecret) return { ok: false, error: "Invalid Resend webhook secret." };

  const key = Buffer.from(encodedSecret, "base64");
  if (!key.length) return { ok: false, error: "Invalid Resend webhook secret." };

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");

  const valid = signature.split(" ").some(value => {
    const [version, supplied] = value.split(",", 2);
    if (version !== "v1" || !supplied) return false;
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    return expectedBuffer.length === suppliedBuffer.length
      && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
  });

  return valid ? { ok: true } : { ok: false, error: "Invalid Resend webhook signature." };
}

async function getReceivedEmail(emailId, fetchImpl) {
  const result = await resendGet(`/emails/receiving/${encodeURIComponent(emailId)}`, fetchImpl);
  return result?.data || result;
}

async function getReceivedAttachments(emailId, eventAttachments, fetchImpl) {
  const listed = await resendGet(
    `/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
    fetchImpl
  ).catch(error => {
    console.warn("Resend attachment listing failed; falling back to webhook metadata", {
      emailId,
      error: error?.message || String(error)
    });
    return { data: eventAttachments };
  });

  const items = Array.isArray(listed?.data)
    ? listed.data
    : (Array.isArray(listed) ? listed : eventAttachments);

  return Promise.all(items.map(async item => {
    const downloadUrl = item.download_url || item.downloadUrl;
    let contentBase64 = item.content_base64 || item.contentBase64 || item.base64 || null;

    if (!contentBase64 && downloadUrl) {
      const response = await fetchImpl(downloadUrl);
      if (!response.ok) {
        throw new Error(`Unable to download Resend attachment (${response.status}).`);
      }
      contentBase64 = Buffer.from(await response.arrayBuffer()).toString("base64");
    }

    if (!contentBase64) {
      throw new Error(
        `Resend attachment "${item.filename || item.name || "attachment"}" has no downloadable content.`
      );
    }

    return {
      filename: item.filename || item.name || "attachment",
      mimeType: item.content_type || item.contentType || "application/octet-stream",
      contentBase64,
      size: Number(item.size) || 0
    };
  }));
}

async function resendGet(path, fetchImpl) {
  const response = await fetchImpl(RESEND_API + path, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Resend API request failed (${response.status})${detail ? `: ${detail.slice(0, 500)}` : ""}`
    );
  }

  return response.json();
}

function toEmailIngestPayload(event, email, attachments) {
  const data = event.data || {};
  return {
    to: first(data.to) || process.env.RESEND_INBOUND_ADDRESS || "",
    from: data.from || email?.from || "",
    subject: data.subject || email?.subject || "",
    text: email?.text || email?.text_body || data.text || "",
    html: email?.html || email?.html_body || data.html || "",
    messageId: data.message_id || email?.message_id || data.email_id,
    ticket: `RESEND:${data.email_id}`,
    receivedAt: data.created_at || event.created_at || new Date().toISOString(),
    attachments
  };
}

function requiredConfiguration() {
  return [
    "RESEND_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "EMAIL_INGEST_SECRET"
  ].filter(name => !String(process.env[name] || "").trim());
}

function integrationError(stage, error) {
  console.error(`Resend inbound email failed at ${stage}`, error);
  return Response.json(
    {
      error: error?.message || "Resend inbound email processing failed.",
      stage
    },
    { status: 502 }
  );
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function svixStatus(error) {
  return /expired/i.test(error) ? 400 : 401;
}
