import handler from "../../../../src/server/api/outlook/callback.js";

export const runtime = "nodejs";

function createLegacyRequest(request) {
  const url = new URL(request.url);
  return {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries())
  };
}

function createLegacyResponse() {
  let statusCode = 200;
  const headers = new Headers();

  return {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      headers.set(name, String(value));
      return this;
    },
    send(payload) {
      return new Response(payload, { status: statusCode, headers });
    }
  };
}

export async function GET(request) {
  return handler(createLegacyRequest(request), createLegacyResponse());
}

export async function POST() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}