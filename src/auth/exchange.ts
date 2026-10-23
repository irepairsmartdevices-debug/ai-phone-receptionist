import { createHash, randomBytes } from "node:crypto";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const pkce = (s: string) =>
  createHash("sha256").update(s).digest("base64url");
export function authorizationRequest() {
  const verifier = randomBytes(32).toString("base64url"),
    state = randomBytes(32).toString("hex");
  const source = process.env.REPAIR_SERVICE_URL,
    target = process.env.APP_ORIGIN;
  if (!source || !target) throw Error("Repair connection is not configured");
  const url = new URL("/api/integrations/receptionist/v1/authorize", source);
  url.searchParams.set(
    "redirect_uri",
    new URL("/api/auth/callback", target).href,
  );
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkce(verifier));
  return { url: url.href, state, verifier };
}
export async function exchange(code: string, verifier: string) {
  const response = await fetch(
    new URL(
      "/api/integrations/receptionist/v1/token",
      process.env.REPAIR_SERVICE_URL,
    ),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.REPAIR_SERVICE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        verifier,
        redirectUri: new URL("/api/auth/callback", process.env.APP_ORIGIN).href,
      }),
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    },
  );
  const data = await response.json();
  if (
    !response.ok ||
    !data.ok ||
    typeof data.value?.grant !== "string" ||
    !["admin", "staff"].includes(data.value?.role)
  )
    throw Error("Staff authorization failed");
  return data.value as { grant: string; role: "admin" | "staff" };
}
