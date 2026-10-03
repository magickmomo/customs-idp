import test from "node:test";
import assert from "node:assert/strict";
import { findPackByUuid, packRoute, packUuidFromPath } from "../src/domain/routes.js";
import { ensurePackUuid } from "../src/domain/packData.js";

test("builds and reads encoded pack routes",()=>{
  const route=packRoute("11111111-1111-4111-8111-111111111111");
  assert.equal(route,"/inbox/11111111-1111-4111-8111-111111111111");
  assert.equal(packUuidFromPath(route),"11111111-1111-4111-8111-111111111111");
});

test("ignores non-pack routes and malformed values",()=>{
  assert.equal(packUuidFromPath("/inbox"),"");
  assert.equal(packUuidFromPath("/customers"),"");
  assert.equal(packUuidFromPath("/inbox/%E0%A4%A"),"");
});

test("resolves only packs present in the visible workspace list",()=>{
  const packs=[{id:"PK-1",packUuid:"11111111-1111-4111-8111-111111111111",customer:"Visible"},{id:"PK-2",packUuid:"22222222-2222-4222-8222-222222222222",customer:"Other"}];
  assert.deepEqual(findPackByUuid(packs,"11111111-1111-4111-8111-111111111111"),packs[0]);
  assert.equal(findPackByUuid(packs,"99999999-9999-4999-8999-999999999999"),null);
});

test("resolves a legacy pack using its stable fallback UUID",()=>{
  const legacy={id:"PK-legacy",customer:"Legacy"};
  assert.deepEqual(findPackByUuid([legacy],ensurePackUuid(legacy)),legacy);
});
