import handler from "../../../../src/server/api/outlook/callback.js";
import { runLegacyHandler } from "../../../../src/server/nextLegacyAdapter.js";

export const runtime = "nodejs";

function createLegacyRequest(request) {
  const url = new URL(request.url);
  return {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries())
  };
}

export async function GET(request) {
  return runLegacyHandler(handler, createLegacyRequest(request));
}

export async function POST() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
