// The dashboard's "please update your extension" reminder: who gets it, and when.
import assert from "node:assert/strict";
import { test } from "node:test";
import { UPDATE_POPUP_DELAYS_MS, extensionStatus, isAtLeast, nextPopupDelay } from "../lib/extensionUpdate.js";
import { EXTENSION_VERSION } from "../lib/version.js";

test("the reminder comes 5 s after opening, 30 s after the first close, then every 60 s", () => {
  assert.deepEqual(UPDATE_POPUP_DELAYS_MS, [5000, 30000, 60000]);
  assert.equal(nextPopupDelay(0), 5000);
  assert.equal(nextPopupDelay(1), 30000);
  assert.equal(nextPopupDelay(2), 60000);
  assert.equal(nextPopupDelay(7), 60000);
  assert.equal(nextPopupDelay(undefined), 5000);
});

test("versions compare by number, not by text", () => {
  assert.equal(isAtLeast("1.0.22", "1.0.22"), true);
  assert.equal(isAtLeast("1.0.23", "1.0.22"), true);
  assert.equal(isAtLeast("1.1.0", "1.0.22"), true);
  assert.equal(isAtLeast("1.0.9", "1.0.22"), false);
  assert.equal(isAtLeast("1.0.21", "1.0.22"), false);
});

test("a bot is up to date only when its latest lead came from the newest extension", () => {
  const lead = (extension) => ({ timing: { extension } });
  assert.deepEqual(extensionStatus(lead(EXTENSION_VERSION), EXTENSION_VERSION), { state: "latest", version: EXTENSION_VERSION });
  assert.deepEqual(extensionStatus(lead("1.0.19"), "1.0.22"), { state: "outdated", version: "1.0.19" });
  assert.deepEqual(extensionStatus(lead(null), "1.0.22"), { state: "outdated", version: null }, "too old to report its version");
  assert.deepEqual(extensionStatus({}, "1.0.22"), { state: "outdated", version: null });
  assert.deepEqual(extensionStatus(null, "1.0.22"), { state: "unknown", version: null }, "no lead yet");
});
