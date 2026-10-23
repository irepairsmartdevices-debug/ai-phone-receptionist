import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { HttpRepairService } from "../src/repair/http";
test("HTTP adapter projects private fields and refuses placeholder fixture grants", async () => {
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    assert.equal(req.headers.authorization, "Bearer test-only");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        value: {
          reference: "1001",
          status: "CONFIRMED",
          version: 1,
          device: "Phone",
          service: "Screen",
          location: "Store",
          temporaryPassword: "never expose",
        },
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const port = (server.address() as { port: number }).port,
      s = new HttpRepairService(`http://127.0.0.1:${port}`, "test-only");
    assert.deepEqual(
      await s.ticket("1001", "fixture-staff", {
        conversationId: "c",
        operationId: "op",
      }),
      { ok: false, code: "UNAUTHORIZED" },
    );
    assert.equal(requests, 0);
    const result = await s.ticket("1001", "real-grant", {
      conversationId: "c",
      operationId: "op",
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal("temporaryPassword" in result.value, false);
  } finally {
    server.close();
  }
});
test("adapter rejects non-HTTPS remote services and maps uncertain writes without retries", async () => {
  assert.throws(() => new HttpRepairService("http://example.com", "token"));
  let writes = 0;
  const server = createServer((req, res) => {
    writes++;
    req.socket.destroy();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const s = new HttpRepairService(
      `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      "test",
    );
    const result = await s.changeStatus(
      {
        ticketReference: "1001",
        expectedVersion: 1,
        targetStatus: "CANCELLED",
        confirmationId: "x",
      },
      "real-grant",
      { conversationId: "c", operationId: "same-op" },
    );
    assert.deepEqual(result, {
      ok: false,
      code: "UNCERTAIN",
      operationId: "same-op",
    });
    assert.equal(writes, 1);
  } finally {
    server.close();
  }
});
