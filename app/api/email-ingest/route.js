import handler from "../../../src/server/api/email-ingest.js";

export const runtime = "nodejs";

function createLegacyRequest(request, body) {
  return {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body,
  };
}

function createLegacyResponse() {
  let statusCode = 200;

  return {
    status(code) {
      statusCode = code;
      return this;
    },

    json(payload) {
      return Response.json(payload, { status: statusCode });
    },
  };
}

async function handle(request) {
  const body = await request.json().catch(() => ({}));

  return handler(
    createLegacyRequest(request, body),
    createLegacyResponse()
  );
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
