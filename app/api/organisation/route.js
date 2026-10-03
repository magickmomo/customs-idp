import handler from "../../../src/server/api/organisation.js";

export const runtime = "nodejs";

async function createLegacyRequest(request) {
  const url = new URL(request.url);
  let body;

  if (!["GET", "HEAD"].includes(request.method)) {
    const text = await request.text();

    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = text;
    }
  }

  return {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries()),
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
  return handler(await createLegacyRequest(request), createLegacyResponse());
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
