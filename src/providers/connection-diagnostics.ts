import { z } from "zod";
import { checkAIConnection } from "./assistant";
import { AIProviderError, type AIEnvironment } from "./config";
import {
  providerErrorDetailsSchema,
  type ProviderErrorDetails,
} from "./failure-details";

const networkCodes = [
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
] as const;

// Only these bounded, non-secret facts may be stored or returned to the admin.
export const connectionDiagnosticSchema = z.object({
  ...providerErrorDetailsSchema.shape,
  elapsedMs: z.number().int().min(0).max(3_600_000),
  phase: z.enum(["request", "response"]),
  source: z.enum([
    "success",
    "app_deadline",
    "provider_http",
    "transport",
    "response",
  ]),
  httpStatus: z.number().int().min(100).max(599).optional(),
  networkCode: z.enum(networkCodes).optional(),
});
export type ConnectionDiagnostic = z.infer<typeof connectionDiagnosticSchema>;

function safeNetworkCode(error: unknown): ConnectionDiagnostic["networkCode"] {
  try {
    const failure = error as {
      code?: unknown;
      cause?: { code?: unknown };
    } | null;
    const code = failure?.cause?.code ?? failure?.code;
    return networkCodes.find((known) => known === code);
  } catch {
    return undefined;
  }
}

/** Observe the existing single request; never send a diagnostic retry. */
export async function traceConnectionCheck(
  env: AIEnvironment,
  fetcher: typeof fetch,
) {
  const startedAt = performance.now();
  const observed: {
    started: boolean;
    phase: ConnectionDiagnostic["phase"];
    signal?: AbortSignal | null;
    httpStatus?: number;
    networkCode?: ConnectionDiagnostic["networkCode"];
    transportFailure: boolean;
    providerDetails?: ProviderErrorDetails;
  } = { started: false, phase: "request", transportFailure: false };
  const result = await checkAIConnection(
    env,
    async (url, init) => {
      observed.started = true;
      observed.signal = init?.signal;
      const response = await fetcher(url, init);
      observed.phase = "response";
      if (response.status >= 100 && response.status <= 599)
        observed.httpStatus = response.status;
      return response;
    },
    (error) => {
      // Observe both connecting failures and later response-body read failures.
      observed.transportFailure = !(error instanceof AIProviderError);
      if (error instanceof AIProviderError)
        observed.providerDetails = error.details;
      observed.networkCode = safeNetworkCode(error);
    },
  );
  if (!observed.started) return { result };
  const source: ConnectionDiagnostic["source"] = result.ok
    ? "success"
    : observed.httpStatus === 408 || observed.httpStatus === 504
      ? "provider_http"
      : observed.signal?.aborted
        ? "app_deadline"
        : observed.transportFailure
          ? "transport"
          : observed.httpStatus !== undefined && observed.httpStatus >= 400
            ? "provider_http"
            : observed.phase === "response"
              ? "response"
              : "transport";
  const diagnostic = connectionDiagnosticSchema.parse({
    ...observed.providerDetails,
    elapsedMs: Math.min(
      3_600_000,
      Math.max(0, Math.round(performance.now() - startedAt)),
    ),
    phase: observed.phase,
    source,
    ...(observed.httpStatus !== undefined
      ? { httpStatus: observed.httpStatus }
      : {}),
    ...(observed.networkCode ? { networkCode: observed.networkCode } : {}),
  });
  return { result, diagnostic };
}
