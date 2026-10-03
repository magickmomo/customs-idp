import test from "node:test";
import assert from "node:assert/strict";
import { runLegacyHandler } from "../src/server/nextLegacyAdapter.js";

test("returns a response written by a legacy handler that exits without returning it", async () => {
  const response = await runLegacyHandler((_request, legacyResponse) => {
    legacyResponse.status(401).json({ error: "Authentication required" });
  }, { method: "GET" });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});

test("preserves headers written by a legacy handler", async () => {
  const response = await runLegacyHandler((_request, legacyResponse) => {
    legacyResponse.setHeader("Location", "/settings");
    legacyResponse.status(302).send("");
  }, { method: "GET" });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/settings");
});
