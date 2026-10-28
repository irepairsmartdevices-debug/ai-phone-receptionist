import { z } from "zod";
import type {
  DialoguePlan,
  DialoguePlanner,
} from "../conversation/assistant-types";
import type { AnswerMatcher } from "../knowledge/types";
import { createDialoguePlanner } from "./dialogue";
import { matchCustomAnswer } from "./knowledge";
import {
  checkGeminiConnection,
  planGeminiTurn,
  publicDialogueInput,
  redactProviderText,
  type GeminiInput,
} from "./gemini";
import {
  AIProviderError,
  getAIStatus,
  responseFailure,
  readProviderJSON,
  safeFailure,
  type AIConnectionResult,
  type AIEnvironment,
} from "./config";
export { getAIStatus } from "./config";
export type { AIConnectionResult, AIErrorReason, AIStatus } from "./config";

/** Construct once per customer turn: planner and answer matching share one budget. */
export function createAssistantProviders(
  env: AIEnvironment = process.env,
  fetcher: typeof fetch = fetch,
): { planner: DialoguePlanner; answerMatcher: AnswerMatcher } {
  const status = getAIStatus(env);
  const key =
    (status.provider === "gemini"
      ? env.GEMINI_API_KEY
      : env.AI_PROVIDER_KEY
    )?.trim() ?? "";
  type Entry = {
    text: string;
    answers: string;
    catalog: string;
    kind: "planner" | "matcher";
    result: Promise<DialoguePlan | string | null>;
  };
  let entry: Entry | undefined;
  const answerKey = (answers: Parameters<AnswerMatcher>[1]) =>
    JSON.stringify(answers.map((answer) => answer.id));
  const planner: DialoguePlanner = async (input: GeminiInput) => {
    if (!status.configured) return null;
    const catalogKey = JSON.stringify(input.catalog ?? []);
    if (!entry) {
      const request =
        status.provider === "gemini"
          ? () => planGeminiTurn(input, key, status.model, fetcher)
          : () => {
              const safe = publicDialogueInput(input);
              return createDialoguePlanner(
                key,
                fetcher,
              )({
                ...input,
                text: safe.text,
                memory: safe.memory,
                answers: input.answers,
              });
            };
      // Assign the budget before scheduling the network call to prevent races.
      entry = {
        text: input.text,
        answers: answerKey(input.answers),
        catalog: catalogKey,
        kind: "planner",
        result: Promise.resolve().then(request),
      };
    }
    if (
      entry.kind !== "planner" ||
      entry.text !== input.text ||
      entry.answers !== answerKey(input.answers) ||
      entry.catalog !== catalogKey
    )
      return null;
    const result = await entry.result;
    return typeof result === "object" ? result : null;
  };
  const answerMatcher: AnswerMatcher = async (text, answers) => {
    if (!status.configured || !answers.length) return null;
    if (!entry) {
      entry = {
        text,
        answers: answerKey(answers),
        catalog: "[]",
        kind: "matcher",
        result: Promise.resolve().then(async () => {
          if (status.provider === "gemini")
            return planGeminiTurn(
              { text, memory: {}, answers },
              key,
              status.model,
              fetcher,
            );
          return matchCustomAnswer(
            redactProviderText(text),
            answers,
            key,
            fetcher,
          );
        }),
      };
    }
    if (entry.text !== text || entry.answers !== answerKey(answers))
      return null;
    const result = await entry.result;
    if (typeof result === "string")
      return answers.some((answer) => answer.id === result) ? result : null;
    return result?.answerIds.length === 1 &&
      answers.some((answer) => answer.id === result.answerIds[0])
      ? result.answerIds[0]
      : null;
  };
  return { planner, answerMatcher };
}

export async function checkAIConnection(
  env: AIEnvironment = process.env,
  fetcher: typeof fetch = fetch,
): Promise<AIConnectionResult> {
  const status = getAIStatus(env);
  if (!status.configured) return { ...status, ok: false };
  try {
    if (status.provider === "gemini")
      await checkGeminiConnection(
        env.GEMINI_API_KEY!.trim(),
        status.model,
        fetcher,
      );
    else {
      const response = await fetcher(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(8000),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.AI_PROVIDER_KEY!.trim()}`,
          },
          body: JSON.stringify({
            model: status.model,
            temperature: 0,
            max_tokens: 64,
            messages: [
              {
                role: "system",
                content: "Return the JSON object with ok set to true.",
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "connection_check",
                strict: true,
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean", enum: [true] } },
                  required: ["ok"],
                  additionalProperties: false,
                },
              },
            },
          }),
        },
      );
      if (!response.ok)
        throw new AIProviderError(await responseFailure(response));
      const raw = (await readProviderJSON(response)) as {
        choices?: {
          finish_reason?: string;
          message?: { content?: string; refusal?: string };
        }[];
      };
      const choice = raw?.choices?.[0];
      if (choice?.finish_reason !== "stop" || choice.message?.refusal)
        throw new AIProviderError("response");
      let value: unknown;
      try {
        value = JSON.parse(choice.message?.content ?? "");
      } catch {
        throw new AIProviderError("response");
      }
      if (
        !z
          .object({ ok: z.literal(true) })
          .strict()
          .safeParse(value).success
      )
        throw new AIProviderError("response");
    }
    return { ...status, ok: true };
  } catch (error) {
    return { ...status, ok: false, reason: safeFailure(error) };
  }
}
