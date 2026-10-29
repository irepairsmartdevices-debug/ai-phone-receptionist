import { AsyncLocalStorage } from "node:async_hooks";
import { channel } from "node:diagnostics_channel";

export type TransportProgress = {
  stage:
    | "request_created"
    | "connection_ready"
    | "body_sent"
    | "response_headers";
  elapsedMs: number;
};
const context = new AsyncLocalStorage<object>();
const stages = [
  "request_created",
  "connection_ready",
  "body_sent",
  "response_headers",
] as const;

/** Observe one existing fetch. Never read headers/body or issue another request. */
export async function traceProviderFetch(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  fetcher: typeof fetch,
  onProgress: (progress: TransportProgress) => void,
): Promise<Response> {
  let target: URL;
  try {
    target = new URL(
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url,
    );
  } catch {
    return fetcher(input, init);
  }
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const token = {};
  const requests = new WeakSet<object>();
  const started = performance.now();
  let latest = -1;
  const listeners: [ReturnType<typeof channel>, (message: unknown) => void][] =
    [];
  const publish = (stage: TransportProgress["stage"]) => {
    const index = stages.indexOf(stage);
    if (index <= latest) return;
    latest = index;
    onProgress({
      stage,
      elapsedMs: Math.min(
        3_600_000,
        Math.max(0, Math.round(performance.now() - started)),
      ),
    });
  };
  const subscribe = (name: string, listener: (message: any) => void) => {
    const guarded = (message: unknown) => {
      // Subscriber exceptions must never escape diagnostics_channel publishing.
      try {
        listener(message);
      } catch {
        /* Observability cannot break fetch. */
      }
    };
    const source = channel(name);
    source.subscribe(guarded);
    listeners.push([source, guarded]);
  };
  const cleanup = () => {
    for (const [source, listener] of listeners) source.unsubscribe(listener);
  };
  try {
    subscribe("undici:request:create", ({ request }) => {
      if (
        context.getStore() !== token ||
        !request ||
        typeof request !== "object"
      )
        return;
      if (
        String(request.origin) !== target.origin ||
        request.path !== target.pathname + target.search ||
        request.method !== method
      )
        return;
      requests.add(request);
      publish("request_created");
    });
    for (const [name, stage] of [
      ["undici:client:sendHeaders", "connection_ready"],
      ["undici:request:bodySent", "body_sent"],
      ["undici:request:headers", "response_headers"],
    ] as const)
      subscribe(name, ({ request, response }) => {
        if (!request || !requests.has(request)) return;
        // Informational headers do not establish arrival of a final response.
        if (stage === "response_headers" && !(response?.statusCode >= 200))
          return;
        publish(stage);
      });
  } catch {
    cleanup();
    return fetcher(input, init);
  }
  try {
    return await context.run(token, () => fetcher(input, init));
  } finally {
    cleanup();
  }
}
