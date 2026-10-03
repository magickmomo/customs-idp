import handler from "../../../src/server/api/agent.js";
import { runLegacyHandler } from "../../../src/server/nextLegacyAdapter.js";

export const runtime = "nodejs";

function createLegacyRequest(request, body) {
  const headers = Object.fromEntries(request.headers.entries());

  return {
    method: request.method,
    headers,
    body,
  };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const legacyRequest = createLegacyRequest(request, body);
  return runLegacyHandler(handler, legacyRequest);
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
