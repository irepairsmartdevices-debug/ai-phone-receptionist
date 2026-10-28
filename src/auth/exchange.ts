import { createHash, randomBytes } from "node:crypto";
import { RepairAuthorizationError } from "./errors";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const pkce = (s: string) =>
  createHash("sha256").update(s).digest("base64url");
function settings() {
  const source = process.env.REPAIR_SERVICE_URL;
  const target = process.env.APP_ORIGIN;
  const token = process.env.REPAIR_SERVICE_TOKEN;
  if (!source || !target || !token || /[\r\n]/.test(token))
    throw new RepairAuthorizationError("repair_configuration");
  try {
    const repair = new URL(source),
      app = new URL(target);
    for (const url of [repair, app]) {
      if (
        url.username ||
        url.password ||
        !(
          url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
        )
      )
        throw Error();
    }
    return { source: repair, target: app, token };
  } catch {
    throw new RepairAuthorizationError("repair_configuration");
  }
}
export function authorizationOrigin() {
  return settings().target.origin;
}
export function authorizationRequest() {
  const verifier = randomBytes(32).toString("base64url"),
    state = randomBytes(32).toString("hex");
  const { source, target } = settings();
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
  const { source, target, token } = settings();
  let response: Response;
  try {
    response = await fetch(
      new URL("/api/integrations/receptionist/v1/token", source),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          verifier,
          redirectUri: new URL("/api/auth/callback", target).href,
        }),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      },
    );
  } catch {
    throw new RepairAuthorizationError("repair_unreachable");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new RepairAuthorizationError("repair_response", response.status);
  }
  if (!response.ok || !data?.ok) {
    if (response.status === 401 && data?.code === "INVALID_MACHINE_CREDENTIAL")
      throw new RepairAuthorizationError("repair_credentials", response.status);
    throw new RepairAuthorizationError(
      response.status >= 500
        ? "repair_unreachable"
        : "repair_authorization_rejected",
      response.status,
    );
  }
  if (
    typeof data.value?.grant !== "string" ||
    !["admin", "staff"].includes(data.value?.role)
  )
    throw new RepairAuthorizationError("repair_response", response.status);
  return data.value as { grant: string; role: "admin" | "staff" };
}
