import { canonicalFaq, compatibleFaq, genericDeviceWords } from "./faq-phrases";
import type { Business } from "../contracts/repair";
import type { CustomAnswer, ManualPrice } from "./types";
export const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\+/g, " plus ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const contains = (text: string, phrase: string) =>
  ` ${normalize(text)} `.includes(` ${normalize(phrase)} `);
export type QuoteOffering = {
  id: string;
  source: "repair" | "manual";
  sourceOfferingId?: string;
  category: string;
  brand: string;
  model: string;
  repair: string;
  priceCents: number;
};
export type QuoteDetails = {
  category?: string;
  brand?: string;
  model?: string;
  repair?: string;
  asked?: "brand" | "model" | "repair";
};
export type LastQuote = {
  model: string;
  repair: string;
  priceCents: number;
  source: "repair" | "manual";
  sourceOfferingId?: string;
};
export function quoteCatalog(
  business: Business | undefined,
  manual: ManualPrice[],
): QuoteOffering[] {
  const source: QuoteOffering[] = (business?.offerings ?? [])
    .filter((o) => Number.isFinite(o.price) && o.price >= 0)
    .map((o) => {
      const hierarchy = o as typeof o & {
        category?: string;
        brand?: string;
        model?: string;
      };
      const override = manual.find((p) => p.sourceOfferingId === o.id);
      return {
        id: `repair:${o.id}`,
        source: override ? "manual" : "repair",
        sourceOfferingId: o.id,
        category: hierarchy.category ?? "",
        brand: hierarchy.brand ?? "",
        model: hierarchy.model ?? o.device,
        repair: o.service,
        priceCents: override?.priceCents ?? Math.round(o.price * 100),
      };
    });
  const local = manual
    .filter(
      (p) =>
        !p.sourceOfferingId &&
        !source.some(
          (o) =>
            o.sourceOfferingId === p.sourceOfferingId && !!p.sourceOfferingId,
        ) &&
        !source.some(
          (o) =>
            normalize(o.model) === normalize(p.model) &&
            normalize(o.repair) === normalize(p.repair) &&
            (!o.brand || normalize(o.brand) === normalize(p.brand)) &&
            (!o.category || normalize(o.category) === normalize(p.category)),
        ),
    )
    .map((p) => ({
      id: `manual:${p.id}`,
      source: "manual" as const,
      sourceOfferingId: p.sourceOfferingId,
      category: p.category,
      brand: p.brand,
      model: p.model,
      repair: p.repair,
      priceCents: p.priceCents,
    }));
  return [...source, ...local];
}
export function isPriceQuestion(text: string) {
  return (
    /\b(price|prices|pricing|cost|costs|quote|estimate|charge|how much)\b/i.test(
      text,
    ) ||
    /^(?:screen|battery)(?: repair| replacement)?[?.! ]*$/i.test(text.trim())
  );
}
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
function repairMentions(text: string, repairs: string[]): string[] {
  const exact = repairs.filter((r) => contains(text, r));
  const direct = exact.filter(
    (r) => !exact.some((other) => other !== r && contains(other, r)),
  );
  // Exact service names win over synonymous alternatives. Still recognize a
  // second component in “screen repair and battery”, rather than choosing one.
  let remainder = ` ${normalize(text)} `;
  for (const repair of direct)
    remainder = remainder.replaceAll(` ${normalize(repair)} `, " ");
  const synonyms = repairs.filter((r) => {
    if (direct.includes(r)) return false;
    const n = normalize(r);
    return (
      (/\b(screen|display|glass)\b/.test(remainder) &&
        /\b(screen|display|glass)\b/.test(n)) ||
      (/\bbattery\b/.test(remainder) && /\bbattery\b/.test(n)) ||
      (/\bcharging port\b/.test(remainder) && /\bcharging port\b/.test(n))
    );
  });
  return [...direct, ...synonyms];
}
export type QuoteResolution = {
  text: string;
  details?: QuoteDetails;
  quote?: LastQuote;
};
const missingPrice =
  "I do not have a confirmed price for that exact device and repair. I can take a callback message so the shop can provide an estimate.";
export function resolveQuote(
  catalog: QuoteOffering[],
  previous: QuoteDetails,
  text: string,
): QuoteResolution {
  if (!catalog.length) return { text: missingPrice };
  let details = { ...previous };
  const norm = normalize(text);
  const brands = unique(catalog.map((o) => o.brand));
  const explicitBrands = brands.filter((b) => contains(text, b));
  const familyBrands = unique(
    catalog
      .filter((o) => {
        const family = normalize(o.model).split(" ")[0];
        return family.length >= 3 && contains(text, family);
      })
      .map((o) => o.brand),
  );
  const mentionedBrands = explicitBrands.length
    ? explicitBrands
    : familyBrands.length === 1
      ? familyBrands
      : [];
  const categories = unique(catalog.map((o) => o.category)).filter((c) =>
    contains(text, c),
  );
  if (mentionedBrands.length === 1) details.brand = mentionedBrands[0];
  if (categories.length === 1) details.category = categories[0];
  const matchingParents = () =>
    catalog.filter(
      (o) =>
        (!details.brand || normalize(o.brand) === normalize(details.brand)) &&
        (!details.category ||
          normalize(o.category) === normalize(details.category)),
    );
  let available = matchingParents();
  // Prefer the longest complete variant. A suffix absent from the stored model is
  // not evidence of the shorter model (14 Pro Max must never resolve to 14 Pro).
  const models = unique(available.map((o) => o.model));
  const mentionedModels = models.filter((m) => {
    const n = normalize(m);
    const at = ` ${norm} `.indexOf(` ${n} `);
    if (at < 0) return false;
    const tail = ` ${norm} `.slice(at + n.length + 2).trim();
    return !/^(pro|max|plus|ultra|fe|mini|se|xl|5g|4g|lte|wifi|wi fi|\d+[a-z]*)\b/.test(
      tail,
    );
  });
  if (!mentionedModels.length && /\b[a-z]*\d+[a-z0-9]*\b/i.test(norm))
    return { text: missingPrice };
  if (mentionedModels.length > 1)
    return {
      text: "Which exact model would you like a price for? Please ask about one device at a time.",
      details: { ...details, model: undefined, asked: "model" },
    };
  const longest = Math.max(
    0,
    ...mentionedModels.map((m) => normalize(m).length),
  );
  const longestModels = mentionedModels.filter(
    (m) => normalize(m).length === longest,
  );
  if (longestModels.length === 1) {
    details.model = longestModels[0];
    const rows = available.filter(
      (o) => normalize(o.model) === normalize(details.model!),
    );
    const modelBrands = unique(rows.map((o) => o.brand));
    const modelCategories = unique(rows.map((o) => o.category));
    if (modelBrands.length === 1) details.brand = modelBrands[0];
    if (modelCategories.length === 1) details.category = modelCategories[0];
  }
  const repairRows = details.model
    ? matchingParents().filter(
        (o) => normalize(o.model) === normalize(details.model!),
      )
    : available;
  const repairText = details.model
    ? ` ${norm} `.replaceAll(` ${normalize(details.model)} `, " ")
    : text;
  const repairs = repairMentions(
    repairText,
    unique(repairRows.map((o) => o.repair)),
  );
  if (
    !repairs.length &&
    ((previous.repair &&
      /\b(repair|replacement|replace|fix|actually|instead|rather)\b/i.test(
        repairText,
      )) ||
      /\b(screen|display|glass|battery|camera|charging|port|speaker|microphone|water|liquid|housing|button|board)\b/i.test(
        repairText,
      ))
  )
    return { text: missingPrice };
  if (repairs.length === 1) details.repair = repairs[0];
  if (repairs.length > 1) details.repair = undefined;
  // A response to a direct question must identify something real, not silently
  // reuse a nearby model or a stale record removed since the previous turn.
  if (
    previous.asked === "brand" &&
    !mentionedBrands.length &&
    !longestModels.length &&
    !categories.length
  )
    return { text: missingPrice };
  if (previous.asked === "model" && !longestModels.length && norm)
    return { text: missingPrice };
  if (previous.asked === "repair" && !repairs.length && norm)
    return { text: missingPrice };
  available = matchingParents();
  const modelRows = details.model
    ? available.filter((o) => normalize(o.model) === normalize(details.model!))
    : [];
  const ambiguousBrand =
    details.model &&
    !details.brand &&
    unique(modelRows.map((o) => o.brand)).length > 1;
  if (!details.brand && brands.length > 0 && (!details.model || ambiguousBrand))
    return {
      text: "What brand is your device, and is it a phone, tablet, or another device?",
      details: { ...details, asked: "brand" },
    };
  if (!details.model)
    return {
      text: "What is the exact model of your device? Please include any Pro, Pro Max, Plus, or Ultra version.",
      details: { ...details, asked: "model" },
    };
  if (!details.repair) {
    const choices = unique(modelRows.map((o) => o.repair));
    if (!choices.length) return { text: missingPrice };
    return {
      text: `Which repair do you need for your ${details.model}?${choices.length <= 5 ? " " + choices.join(" or ") + "?" : ""}`,
      details: { ...details, asked: "repair" },
    };
  }
  const matches = available.filter(
    (o) =>
      normalize(o.model) === normalize(details.model!) &&
      normalize(o.repair) === normalize(details.repair!),
  );
  if (!matches.length) return { text: missingPrice };
  if (matches.length > 1) {
    const categories = unique(matches.map((o) => o.category));
    return {
      text:
        categories.length > 1
          ? "Which device category is that model in? Please specify phone, tablet, or the device type."
          : "I found more than one matching repair entry. Please confirm the brand and exact model with the shop; I can take a callback message.",
      details:
        categories.length > 1 ? { ...details, asked: "brand" } : undefined,
    };
  }
  const entry = matches[0];
  return {
    text: `${entry.brand ? entry.brand + " " : ""}${entry.model} · ${entry.repair}: $${(entry.priceCents / 100).toFixed(2)} estimate. Final pricing is confirmed by the shop after inspection.${entry.source === "manual" ? " This is an informational estimate; any appointment price must be reviewed separately." : ""}`,
    quote: {
      model: entry.model,
      repair: entry.repair,
      priceCents: entry.priceCents,
      source: entry.source,
      sourceOfferingId: entry.sourceOfferingId,
    },
  };
}
export function matchSavedAnswer(
  text: string,
  answers: CustomAnswer[],
): { answer?: CustomAnswer; ambiguous?: boolean } {
  const n = normalize(text);
  const exact = answers.filter((a) =>
    [a.question, ...a.variations].some((q) => normalize(q) === n),
  );
  if (exact.length === 1) return { answer: exact[0] };
  if (exact.length > 1) return { ambiguous: true };
  const stop = new Set([
    "a",
    "an",
    "the",
    "is",
    "are",
    "do",
    "does",
    "can",
    "could",
    "you",
    "your",
    "i",
    "my",
    "me",
    "we",
    "it",
    "to",
    "for",
    "of",
    "what",
    "how",
    "please",
    "have",
    "on",
  ]);
  const words = (s: string) =>
    new Set(
      canonicalFaq(normalize(s))
        .split(" ")
        .filter((w) => !stop.has(w)),
    );
  const input = words(text);
  const candidates = answers.filter(
    (a) =>
      compatibleFaq(n, normalize(a.question)) &&
      [a.question, ...a.variations].some((q) => {
        if (!compatibleFaq(n, normalize(q))) return false;
        const tokens = words(q);
        const core = (values: Set<string>) =>
          [...values].filter((w) => !genericDeviceWords.has(w)).sort();
        const inputCore = core(input),
          savedCore = core(tokens);
        if (
          inputCore.length >= 2 &&
          inputCore.join(" ") === savedCore.join(" ")
        )
          return true;
        const overlap = [...tokens].filter((t) => input.has(t)).length;
        return (
          overlap >= 2 && overlap / Math.max(tokens.size, input.size) >= 0.8
        );
      }),
  );
  return candidates.length === 1
    ? { answer: candidates[0] }
    : candidates.length > 1
      ? { ambiguous: true }
      : {};
}
