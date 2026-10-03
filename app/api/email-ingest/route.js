import handler from "../../../src/server/api/email-ingest.js";
import { runLegacyHandler } from "../../../src/server/nextLegacyAdapter.js";

export const runtime = "nodejs";

function createLegacyRequest(request, body) {
  return {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
  };
}

async function handle(request) {
  const body = await request.json().catch(() => ({}));
  return runLegacyHandler(handler, createLegacyRequest(request, body));
}

export async function POST(request) {
  return handle(request);
}

export async function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function PUT() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function PATCH() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function DELETE() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
