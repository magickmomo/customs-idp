import assert from "node:assert/strict";
import test from "node:test";
import {
  hasPasswordSetupMarker,
  passwordRecoveryRedirect,
  shouldEnterPasswordSetup
} from "../src/auth/passwordRecovery.js";

const session = {
  access_token: "test-access-token",
  user: { user_metadata: {} }
};

test("builds a dedicated recovery redirect URL", () => {
  assert.equal(passwordRecoveryRedirect("http://localhost:3000/"), "http://localhost:3000/reset-password");
});

test("recognises recovery callbacks in paths, queries, and fragments", () => {
  assert.equal(hasPasswordSetupMarker({ pathname: "/reset-password" }), true);
  assert.equal(hasPasswordSetupMarker({ search: "?type=recovery" }), true);
  assert.equal(hasPasswordSetupMarker({ hash: "#access_token=test&type=invite" }), true);
  assert.equal(hasPasswordSetupMarker({ pathname: "/inbox" }), false);
});

test("enters password setup before organisation authentication", () => {
  assert.equal(shouldEnterPasswordSetup({ event: "PASSWORD_RECOVERY", session }), true);
  assert.equal(shouldEnterPasswordSetup({ session, locationLike: { pathname: "/reset-password" } }), true);
});

test("does not expose password setup without an authenticated Supabase session", () => {
  assert.equal(shouldEnterPasswordSetup({ event: "PASSWORD_RECOVERY", session: null }), false);
});

test("requires invited users to set a password once", () => {
  const invited = { access_token: "test", user: { invited_at: "2026-10-10", user_metadata: {} } };
  assert.equal(shouldEnterPasswordSetup({ session: invited }), true);
  invited.user.user_metadata.customs_idp_password_set = true;
  assert.equal(shouldEnterPasswordSetup({ session: invited }), false);
});
