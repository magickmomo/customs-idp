import handler from "../../../src/server/api/packs.js";
import { runLegacyHandler } from "../../../src/server/nextLegacyAdapter.js";

export const runtime = "nodejs";

function createLegacyRequest(request, body) {
  const url = new URL(request.url);

  return {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
    query: Object.fromEntries(url.searchParams.entries()),
  };
}

async function handle(request) {
  let body = {};

  if (request.method !== "GET" && request.method !== "DELETE") {
    body = await request.json().catch(() => ({}));
  }

  const legacyRequest = createLegacyRequest(request, body);
  return runLegacyHandler(handler, legacyRequest);
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}

export async function DELETE(request) {
  return handle(request);
}

export async function PUT() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export async function PATCH() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
