import { z } from "zod";
import { AIProviderError, readProviderJSON, responseFailure } from "./config";

// Raw REST responses contain steps. output_text is only an SDK convenience.
const interactionSchema = z.object({
  status: z.literal("completed"),
  errors: z.array(z.unknown()).max(0).nullish(),
  error: z.null().optional(),
  steps: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("thought") }),
        z.object({
          type: z.literal("model_output"),
          error: z.null().optional(),
          content: z
            .array(
              z.object({
                type: z.literal("text"),
                text: z.string(),
              }),
            )
            .min(1),
        }),
      ]),
    )
    .min(1),
});

/** One stateless structured request, using the owner's exported API contract. */
export async function generateGeminiInteractionJSON(
  key: string,
  model: string,
  system: string,
  data: object,
  schema: object,
  fetcher: typeof fetch,
  maxOutputTokens: number,
  timeoutMs: number,
): Promise<unknown> {
  const response = await fetcher(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model,
        input: JSON.stringify(data),
        system_instruction: system,
        store: false,
        stream: false,
        background: false,
        generation_config: {
          max_output_tokens: maxOutputTokens,
          thinking_level: "medium",
        },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema,
        },
      }),
    },
  );
  if (!response.ok) throw await responseFailure(response);
  const parsed = interactionSchema.safeParse(await readProviderJSON(response));
  if (!parsed.success) throw new AIProviderError("response");
  const outputs = parsed.data.steps.filter(
    (step) => step.type === "model_output",
  );
  // No tools were requested; multiple model outputs would be ambiguous.
  if (outputs.length !== 1) throw new AIProviderError("response");
  const text = outputs[0].content.map((part) => part.text).join("");
  if (!text.trim()) throw new AIProviderError("response");
  try {
    return JSON.parse(text);
  } catch {
    throw new AIProviderError("response");
  }
}
