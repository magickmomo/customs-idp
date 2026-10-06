import { after } from "next/server";
import { handleResendWebhook } from "../../../../src/server/api/resend-webhook.js";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request) {
  return handleResendWebhook({
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    rawBody: await request.text(),
    defer: after
  });
}

export async function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
