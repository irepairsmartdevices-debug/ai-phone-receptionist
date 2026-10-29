import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import { channel } from "node:diagnostics_channel";
import {
  traceProviderFetch,
  type TransportProgress,
} from "../src/providers/transport-progress";

async function server(
  handler: RequestListener,
  run: (url: string) => Promise<void>,
) {
  const http = createServer(handler);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    http.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      http.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
const names = [
  "undici:request:create",
  "undici:client:sendHeaders",
  "undici:request:bodySent",
  "undici:request:headers",
];

test("real POST reports client milestones without exposing headers, URL or body", async () => {
  const progress: TransportProgress[] = [];
  let received = 0;
  const before = names.map((name) => channel(name).hasSubscribers);
  await server(
    (request, response) => {
      received++;
      request.resume();
      request.on("end", () => response.end("ok"));
    },
    async (url) => {
      const response = await traceProviderFetch(
        url,
        {
          method: "POST",
          body: "private-test-body",
          headers: { authorization: "private-test-key" },
        },
        fetch,
        (value) => progress.push(value),
      );
      assert.equal(await response.text(), "ok");
    },
  );
  assert.equal(received, 1);
  assert.deepEqual(
    progress.map((value) => value.stage),
    ["request_created", "connection_ready", "body_sent", "response_headers"],
  );
  assert.ok(progress.every((value) => value.elapsedMs >= 0));
  assert.doesNotMatch(
    JSON.stringify(progress),
    /private|127\.0\.0\.1|authorization/,
  );
  assert.deepEqual(
    names.map((name) => channel(name).hasSubscribers),
    before,
  );
});

test("a request waiting for headers retains body-sent evidence and cleans up on abort", async () => {
  const progress: TransportProgress[] = [];
  const before = names.map((name) => channel(name).hasSubscribers);
  await server(
    (request) => request.resume(),
    async (url) => {
      await assert.rejects(
        traceProviderFetch(
          url,
          {
            method: "POST",
            body: "fixed check",
            signal: AbortSignal.timeout(200),
          },
          fetch,
          (value) => progress.push(value),
        ),
      );
    },
  );
  assert.equal(progress.at(-1)?.stage, "body_sent");
  assert.deepEqual(
    names.map((name) => channel(name).hasSubscribers),
    before,
  );
});

test("concurrent requests and unrelated channel events do not contaminate each other", async () => {
  const slow: TransportProgress[] = [],
    fast: TransportProgress[] = [];
  const finished: string[] = [];
  await server(
    (request, response) => {
      request.resume();
      request.on("end", () =>
        setTimeout(
          () => {
            finished.push(request.url!);
            response.end("ok");
          },
          request.url === "/slow" ? 70 : 0,
        ),
      );
    },
    async (url) => {
      const fetcher: typeof fetch = async (input, init) => {
        const unrelated = {
          origin: "https://private.test",
          path: "/private",
          method: "POST",
        };
        channel("undici:request:create").publish({ request: unrelated });
        channel("undici:request:headers").publish({
          request: unrelated,
          response: { statusCode: 200 },
        });
        return fetch(input, init);
      };
      const responses = await Promise.all([
        traceProviderFetch(
          `${url}/slow`,
          { method: "POST", body: "one" },
          fetcher,
          (value) => slow.push(value),
        ),
        traceProviderFetch(
          `${url}/fast`,
          { method: "POST", body: "two" },
          fetcher,
          (value) => fast.push(value),
        ),
      ]);
      await Promise.all(responses.map((response) => response.text()));
    },
  );
  assert.deepEqual(finished, ["/fast", "/slow"]);
  assert.deepEqual(
    slow.map((value) => value.stage),
    ["request_created", "connection_ready", "body_sent", "response_headers"],
  );
  assert.deepEqual(
    fast.map((value) => value.stage),
    ["request_created", "connection_ready", "body_sent", "response_headers"],
  );
});

test("unobserved transports remain unobserved and a failing subscriber cannot break fetch", async () => {
  let calls = 0;
  const progress: TransportProgress[] = [];
  const response = await traceProviderFetch(
    "https://provider.test/",
    {},
    async () => {
      calls++;
      return Response.json({ ok: true });
    },
    (value) => progress.push(value),
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.deepEqual(progress, []);
  await server(
    (request, reply) => {
      request.resume();
      reply.end("ok");
    },
    async (url) => {
      const result = await traceProviderFetch(
        url,
        { method: "POST", body: "one" },
        fetch,
        () => {
          throw Error("private callback");
        },
      );
      assert.equal(await result.text(), "ok");
    },
  );
});

test("successive checks remain correlated when reusing a connection", async () => {
  const sockets = new Set();
  const events: TransportProgress[][] = [];
  await server(
    (request, response) => {
      sockets.add(request.socket);
      request.resume();
      request.on("end", () => response.end("ok"));
    },
    async (url) => {
      for (let index = 0; index < 2; index++) {
        const current: TransportProgress[] = [];
        events.push(current);
        const response = await traceProviderFetch(
          url,
          { method: "POST", body: "one" },
          fetch,
          (progress) => current.push(progress),
        );
        await response.text();
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
  );
  assert.equal(sockets.size, 1);
  for (const current of events)
    assert.deepEqual(
      current.map((value) => value.stage),
      ["request_created", "connection_ready", "body_sent", "response_headers"],
    );
});

test("informational headers do not count as a final provider response", async () => {
  const progress: TransportProgress[] = [];
  await traceProviderFetch(
    "https://provider.test/check",
    { method: "POST" },
    async () => {
      const request = {
        origin: "https://provider.test",
        path: "/check",
        method: "POST",
      };
      channel("undici:request:create").publish({ request });
      channel("undici:request:headers").publish({
        request,
        response: { statusCode: 103 },
      });
      channel("undici:request:bodySent").publish({ request });
      return Response.json({ ok: true });
    },
    (value) => progress.push(value),
  );
  assert.deepEqual(
    progress.map((value) => value.stage),
    ["request_created", "body_sent"],
  );
});
