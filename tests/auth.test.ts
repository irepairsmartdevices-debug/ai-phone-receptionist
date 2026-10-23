import test from "node:test";
import assert from "node:assert/strict";
import { assertLocalFixture, assertMutationOrigin } from "../src/auth/guards";
test("fixture mode cannot be exposed on remote hosts or connected production", () => {
  assert.doesNotThrow(() => assertLocalFixture("http://localhost:3000"));
  assert.throws(() => assertLocalFixture("https://public.example"));
  assert.throws(() => assertLocalFixture("http://127.0.0.1:3000", "connected"));
});
test("mutations reject cross-origin requests and forged localhost host", () => {
  assert.throws(() =>
    assertMutationOrigin(
      new Request("http://localhost:3000/api", {
        headers: { origin: "https://evil.example" },
      }),
    ),
  );
  assert.throws(() =>
    assertMutationOrigin(
      new Request("http://evil.example/api", {
        headers: { origin: "http://evil.example" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    assertMutationOrigin(
      new Request("http://localhost:3000/api", {
        headers: { origin: "http://localhost:3000" },
      }),
    ),
  );
});
