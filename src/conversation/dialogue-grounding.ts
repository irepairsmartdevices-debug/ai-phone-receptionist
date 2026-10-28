import { redact } from "../persistence/conversations";
import { normalize } from "../knowledge/resolve";
import type {
  DialogueCatalogItem,
  DialogueDetails,
  DialogueMemory,
} from "./assistant-types";
export const detailKeys = [
  "liquid",
  "occurredAt",
  "symptoms",
  "power",
] as const;
export function boundedDetails(
  details: DialogueDetails | undefined,
): DialogueDetails {
  return Object.fromEntries(
    detailKeys.flatMap((key) =>
      typeof details?.[key] === "string" && details[key]?.trim()
        ? [[key, redact(details[key]!).slice(0, 240)]]
        : [],
    ),
  );
}
export const correcting = (text: string) =>
  /\b(actually|instead|correction|rather|different|not the|not an?|wrong model)\b/i.test(
    text,
  );
export function grounded(value: string | null | undefined, text: string) {
  return (
    typeof value === "string" &&
    !!normalize(value) &&
    ` ${normalize(text)} `.includes(` ${normalize(value)} `)
  );
}
// Keep an unlisted variant intact: a selected shorter catalog model is not evidence.
export function exactModelIn(text: string, model: string) {
  const source = ` ${normalize(text)} `;
  const candidate = normalize(model);
  const at = source.indexOf(` ${candidate} `);
  if (at < 0) return false;
  return !/^(pro|max|plus|ultra|fe|mini|se|xl|5g|4g|lte|wifi|wi fi|\d+[a-z]*)\b/.test(
    source.slice(at + candidate.length + 2).trim(),
  );
}
export function catalogModel(text: string, catalog: DialogueCatalogItem[]) {
  const matches = [
    ...new Set(
      catalog
        .filter((row) => exactModelIn(text, row.model))
        .map((row) => row.model),
    ),
  ];
  const longest = matches.filter(
    (model) =>
      !matches.some(
        (other) =>
          other !== model && normalize(other).includes(normalize(model)),
      ),
  );
  return longest.length === 1 ? longest[0] : undefined;
}
export function observations(
  text: string,
  memory: DialogueMemory,
  proposed?: DialogueDetails,
) {
  const details = boundedDetails(memory.details);
  const patterns: Record<keyof DialogueDetails, RegExp> = {
    liquid:
      /\b(?:(?:pool|salt|fresh|tap|sea) water|water|coffee|tea|soda|juice|milk|rain|beer)\b/i,
    occurredAt:
      /\b(?:yesterday(?: evening| morning| afternoon)?|today|last (?:night|week|month)|(?:\d+|a|an|one|two|three|few) (?:minutes?|hours?|days?|weeks?) ago|this (?:morning|evening|afternoon))\b/i,
    symptoms:
      /\b(?:(?:screen|display) (?:is |went )?(?:black|blank|cracked|flickering)|(?:will not|won't|wont|cannot|can't|doesn't|does not) (?:turn on|charge|power on)|not charging|no (?:display|sound)|battery (?:is )?swollen|cracked (?:screen|display))\b/i,
    power:
      /\b(?:(?:still |currently |powered |turned |switched )(?:on|off)|(?:will not|won't|wont|cannot|can't|doesn't|does not) (?:turn on|power on))\b/i,
  };
  const negativeLiquid =
    /\b(?:never|not|no|didn't|didnt)(?:\s+\w+){0,3}\s+(?:wet|water|liquid)\b/i.test(
      text,
    );
  for (const key of detailKeys) {
    if (key === "liquid" && negativeLiquid) continue;
    const candidate = proposed?.[key];
    const explicit = text.match(patterns[key])?.[0];
    if (explicit) details[key] = redact(explicit).slice(0, 240);
    if (
      grounded(candidate, text) &&
      (patterns[key].test(candidate!) ||
        memory.askedGoal === key ||
        !detailKeys.some(
          (other) => other !== key && patterns[other].test(candidate!),
        ))
    )
      details[key] = redact(candidate!).slice(0, 240);
    // Short replies answer the one observational slot actually requested.
    if (
      memory.askedGoal === key &&
      text.length <= 120 &&
      !/[?]/.test(text) &&
      !/\b(actually|instead|model|phone|tablet|laptop|book|ticket|password)\b/i.test(
        text,
      ) &&
      !detailKeys.some((other) => other !== key && patterns[other].test(text))
    )
      details[key] = redact(text).slice(0, 240);
  }
  return details;
}
