export type AIErrorReason =
  | "configuration"
  | "missing_key"
  | "authentication"
  | "model"
  | "quota"
  | "timeout"
  | "unavailable"
  | "response";
export type AIStatus = {
  provider: "gemini" | "openai" | "none";
  model: string;
  configured: boolean;
  reason?: AIErrorReason;
};
export type AIConnectionResult = AIStatus & { ok: boolean };
export type AIEnvironment = Record<string, string | undefined>;

export function getAIStatus(env: AIEnvironment = process.env): AIStatus {
  const selected = env.AI_PROVIDER?.trim().toLowerCase() || "openai";
  if (selected === "none")
    return {
      provider: "none",
      model: "",
      configured: false,
      reason: "configuration",
    };
  if (selected !== "gemini" && selected !== "openai")
    return {
      provider: "none",
      model: "",
      configured: false,
      reason: "configuration",
    };
  const model =
    selected === "gemini"
      ? env.GEMINI_MODEL?.trim() || "gemini-3.8-flash"
      : "gpt-4.1-mini";
  // A model is a single resource ID, never a URL, path or query string.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(model))
    return {
      provider: selected,
      model: "",
      configured: false,
      reason: "configuration",
    };
  const key = selected === "gemini" ? env.GEMINI_API_KEY : env.AI_PROVIDER_KEY;
  return {
    provider: selected,
    model,
    configured: Boolean(key?.trim()),
    ...(!key?.trim() ? { reason: "missing_key" as const } : {}),
  };
}

export class AIProviderError extends Error {
  constructor(readonly reason: AIErrorReason) {
    super(`AI provider ${reason}`);
    this.name = "AIProviderError";
  }
}

export function httpFailure(status: number): AIErrorReason {
  if (status === 401 || status === 403) return "authentication";
  if (status === 400 || status === 404) return "model";
  if (status === 429) return "quota";
  if (status === 408 || status === 504) return "timeout";
  return "unavailable";
}

/** Google's rejected API keys can use HTTP 400 with structured ErrorInfo. */
export async function responseFailure(
  response: Response,
): Promise<AIErrorReason> {
  const fallback = httpFailure(response.status);
  if (response.status !== 400) return fallback;
  try {
    const raw = (await readProviderJSON(response)) as {
      error?: { details?: unknown };
    };
    const details = raw?.error?.details;
    if (
      Array.isArray(details) &&
      details.some(
        (detail) =>
          detail &&
          typeof detail === "object" &&
          "reason" in detail &&
          [
            "API_KEY_INVALID",
            "API_KEY_EXPIRED",
            "API_KEY_SERVICE_BLOCKED",
            "API_KEY_HTTP_REFERRER_BLOCKED",
            "API_KEY_IP_ADDRESS_BLOCKED",
          ].includes(String(detail.reason)),
      )
    )
      return "authentication";
  } catch {
    /* Ignore private error bodies; only the safe status category escapes. */
  }
  return fallback;
}

export function safeFailure(error: unknown): AIErrorReason {
  if (error instanceof AIProviderError) return error.reason;
  if (
    error instanceof Error &&
    ["TimeoutError", "AbortError"].includes(error.name)
  )
    return "timeout";
  return "unavailable";
}

/** Limit bytes before JSON parsing, including a malicious or malfunctioning server. */
export async function readProviderJSON(response: Response): Promise<unknown> {
  if (!response.body) throw new AIProviderError("response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) {
        await reader.cancel();
        throw new AIProviderError("response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AIProviderError("response");
  }
}
