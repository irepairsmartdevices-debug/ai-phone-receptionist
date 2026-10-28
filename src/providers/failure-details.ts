import { z } from "zod";

export const apiKeyErrorReasons = [
  "API_KEY_INVALID",
  "API_KEY_EXPIRED",
  "API_KEY_SERVICE_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED",
  "API_KEY_IP_ADDRESS_BLOCKED",
] as const;
export const providerErrorDetailsSchema = z.object({
  providerCode: z
    .enum([
      "INVALID_ARGUMENT",
      "FAILED_PRECONDITION",
      "NOT_FOUND",
      "PERMISSION_DENIED",
      "UNAUTHENTICATED",
      "RESOURCE_EXHAUSTED",
      "UNAVAILABLE",
      "DEADLINE_EXCEEDED",
      "INTERNAL",
      "UNKNOWN",
      "ABORTED",
      "OUT_OF_RANGE",
      "UNIMPLEMENTED",
    ])
    .optional(),
  providerReason: z
    .enum([
      ...apiKeyErrorReasons,
      "SERVICE_DISABLED",
      "BILLING_DISABLED",
      "CONSUMER_INVALID",
      "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
      "RATE_LIMIT_EXCEEDED",
      "MODEL_NOT_FOUND",
      "MODEL_NOT_SUPPORTED",
      "MODEL_OVERLOADED",
    ])
    .optional(),
  parameters: z
    .array(
      z.enum([
        "thinking_level",
        "thinking_budget",
        "response_schema",
        "response_mime_type",
        "max_output_tokens",
        "temperature",
        "system_instruction",
        "generation_config",
      ]),
    )
    .max(4)
    .optional(),
});
export type ProviderErrorDetails = z.infer<typeof providerErrorDetailsSchema>;
type Parameter = NonNullable<ProviderErrorDetails["parameters"]>[number];

const parameterNames: readonly [Parameter, RegExp][] = [
  ["thinking_level", /\bthinking[_ .]?level\b/i],
  ["thinking_budget", /\bthinking[_ .]?budget\b/i],
  [
    "response_schema",
    /\b(?:response[_ .]?(?:json[_ .]?)?schema|additionalProperties)\b/i,
  ],
  ["response_mime_type", /\bresponse[_ .]?mime[_ .]?type\b/i],
  ["max_output_tokens", /\bmax[_ .]?output[_ .]?tokens\b/i],
  ["temperature", /\btemperature\b/i],
  ["system_instruction", /\bsystem[_ .]?instruction\b/i],
];
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Reduce private error bodies to fixed literals; never return descriptions/messages. */
export function readProviderErrorDetails(
  raw: unknown,
): ProviderErrorDetails | undefined {
  const error = record(record(raw).error);
  const code = providerErrorDetailsSchema.shape.providerCode.safeParse(
    error.status,
  );
  const details = Array.isArray(error.details)
    ? error.details.slice(0, 32).map(record)
    : [];
  const reasons = details.map((detail) => detail.reason);
  const reason =
    apiKeyErrorReasons.find((known) => reasons.includes(known)) ??
    reasons.find(
      (value) =>
        value !== undefined &&
        providerErrorDetailsSchema.shape.providerReason.safeParse(value)
          .success,
    );
  const fields = details
    .flatMap((detail) => {
      const values = detail.fieldViolations ?? detail.field_violations;
      return Array.isArray(values)
        ? values.slice(0, 32).map((value) => record(value).field)
        : [];
    })
    .filter((value): value is string => typeof value === "string")
    .map((field) => field.slice(0, 1000));
  const message =
    typeof error.message === "string" ? error.message.slice(0, 8192) : "";
  const named = parameterNames
    .filter(
      ([, pattern]) =>
        fields.some((field) => pattern.test(field)) || pattern.test(message),
    )
    .map(([name]) => name)
    .slice(0, 4);
  if (
    !named.length &&
    /\bgeneration[_ .]?config\b/i.test([...fields, message].join(" "))
  )
    named.push("generation_config");
  const safe = providerErrorDetailsSchema.parse({
    ...(code.success && code.data ? { providerCode: code.data } : {}),
    ...(reason ? { providerReason: reason } : {}),
    ...(named.length ? { parameters: named } : {}),
  });
  return Object.keys(safe).length ? safe : undefined;
}
