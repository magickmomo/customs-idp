export function createLegacyResponse() {
  let response;
  let statusCode = 200;
  const headers = new globalThis.Headers();

  return {
    get response() {
      return response;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      headers.set(name, String(value));
      return this;
    },
    send(payload) {
      response = new globalThis.Response(payload, { status: statusCode, headers });
      return response;
    },
    json(payload) {
      response = globalThis.Response.json(payload, { status: statusCode, headers });
      return response;
    }
  };
}

export async function runLegacyHandler(handler, request) {
  const response = createLegacyResponse();
  const result = await handler(request, response);

  return result instanceof globalThis.Response
    ? result
    : response.response || globalThis.Response.json({ error: "Handler did not return a response" }, { status: 500 });
}
