// Small, explicit vocabulary equivalences for matching saved business FAQs.
// This does not alter catalog/model matching or generate any answer text.
export function canonicalFaq(text: string) {
  return text
    .replace(
      /\b(fix|fixes|fixed|fixing|repairs|repaired|repairing)\b/g,
      "repair",
    )
    .replace(/\b(damaged|damages)\b/g, "damage")
    .replace(/\bliquid(?= damage\b)/g, "water")
    .replace(
      /\b(phones|smartphones|smartphone|cellphone|cellphones|handsets|handset)\b/g,
      "phone",
    )
    .replace(/\bdevices\b/g, "device")
    .replace(/\btablets\b/g, "tablet")
    .replace(/\blaptops\b/g, "laptop");
}
const same = (a: string[], b: string[]) =>
  [...new Set(a)].sort().join("|") === [...new Set(b)].sort().join("|");
const categories = [
  ["phone", /\b(phone|phones|smartphones?|iphones?\d*|handsets?)\b/],
  ["tablet", /\b(tablets?|ipads?\d*)\b/],
  ["laptop", /\b(laptops?|macbooks?)\b/],
  ["computer", /\b(computers?|desktops?|pcs?)\b/],
  ["watch", /\b(watches|watch|smartwatch)\b/],
  ["console", /\b(consoles?|playstation|xbox)\b/],
] as const;
const components = [
  ["water", /\b(water|liquid|wet)\b/],
  ["screen", /\b(screen|display|glass)\b/],
  ["battery", /\bbattery\b/],
  ["camera", /\bcamera\b/],
  ["port", /\bcharging port\b/],
] as const;
const facets = [
  ["warranty", /\b(warranty|guarantee)\b/],
  ["refund", /\brefund\b/],
  ["buy", /\b(buy|purchase|trade)\b/],
  ["sell", /\bsell\b/],
  ["time", /\b(how long|when|duration|turnaround|ready)\b/],
  ["data", /\b(data|photos|password)\b/],
] as const;
const select = (text: string, groups: readonly (readonly [string, RegExp])[]) =>
  groups.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
export const genericDeviceWords = new Set([
  "device",
  "phone",
  "tablet",
  "laptop",
  "computer",
  "desktop",
  "watch",
  "console",
]);
export function compatibleFaq(input: string, candidate: string) {
  const negation = /\b(not|no|never|dont|doesnt|cant|cannot|wont)\b/;
  if (negation.test(input) !== negation.test(candidate)) return false;
  const a = select(canonicalFaq(input), categories),
    b = select(canonicalFaq(candidate), categories);
  if (a.length && b.length && a.some((c) => !b.includes(c))) return false;
  const ac = select(input, components),
    bc = select(candidate, components);
  if (ac.length && bc.length && !same(ac, bc)) return false;
  if (!same(select(input, facets), select(candidate, facets))) return false;
  const ids = (text: string) => text.match(/\b[a-z]*\d+[a-z0-9]*\b/g) ?? [];
  const inputIds = ids(input),
    candidateIds = ids(candidate);
  if (!same(inputIds, candidateIds)) return false;
  if (inputIds.length || candidateIds.length) {
    const modifiers = (text: string) =>
      text.match(/\b(pro|max|plus|ultra|mini|fe|se|lte|wifi)\b/g) ?? [];
    if (!same(modifiers(input), modifiers(candidate))) return false;
  }
  return true;
}
