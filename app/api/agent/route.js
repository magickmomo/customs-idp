import handler from "../../../src/server/api/agent.js";

export const runtime = "nodejs";

function createLegacyRequest(request, body) {
  const headers = Object.fromEntries(request.headers.entries());

  return {
    method: request.method,
    headers,
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

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const legacyRequest = createLegacyRequest(request, body);
  const legacyResponse = createLegacyResponse();

  return handler(legacyRequest, legacyResponse);
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
