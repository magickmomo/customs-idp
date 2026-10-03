import handler from "../../../src/server/api/storage.js";
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

  if (
    request.method === "POST" ||
    request.method === "PUT" ||
    request.method === "PATCH"
  ) {
    body = await request.json().catch(() => ({}));
  }

  return runLegacyHandler(handler, createLegacyRequest(request, body));
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}

export async function PUT(request) {
  return handle(request);
}

export async function PATCH(request) {
  return handle(request);
}

export async function DELETE(request) {
  return handle(request);
}
