import type { Business } from "../contracts/repair";
import type { StoreGuide } from "./assistant-types";
const normalized = (s: string) =>
  s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export function resolveStores(
  businessLocations: Business["locations"],
  guides: StoreGuide[],
  mode: "fixture" | "connected",
): StoreGuide[] {
  if (mode === "fixture") return guides.map((g) => ({ ...g }));
  const result: StoreGuide[] = businessLocations.map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    landmarks: "",
    sourceLocationId: l.id,
  }));
  for (const guide of guides) {
    const exact = businessLocations.filter(
      (l) => normalized(l.name) === normalized(guide.name),
    );
    const source = guide.sourceLocationId
      ? businessLocations.find((l) => l.id === guide.sourceLocationId)
      : exact.length === 1
        ? exact[0]
        : undefined;
    if (source) {
      const index = result.findIndex((s) => s.sourceLocationId === source.id);
      const merged = {
        ...guide,
        sourceLocationId: source.id,
        address: source.address.trim(),
      };
      if (index >= 0) result[index] = merged;
      else result.push(merged);
    } else
      result.push({
        ...guide,
        ...(guide.sourceLocationId ? { address: "" } : {}),
      });
  }
  return result;
}
export function renderDirections(store: StoreGuide): string {
  const address = store.address.trim(),
    landmarks = store.landmarks.trim();
  const lines = [
    address
      ? `Our ${store.name} store is at ${address}.`
      : `I don’t have a confirmed street address for our ${store.name} store.`,
  ];
  if (landmarks) lines.push(landmarks);
  if (address) {
    const maps = new URL("https://www.google.com/maps/dir/");
    maps.searchParams.set("api", "1");
    maps.searchParams.set("destination", address);
    lines.push(`Directions: ${maps.href}`);
  } else
    lines.push(
      "Please contact the shop to confirm the full address before travelling.",
    );
  return lines.join("\n");
}
