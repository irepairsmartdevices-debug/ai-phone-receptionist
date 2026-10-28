const messages = {
  authorization:
    "The repair connection could not be completed. Start a new connection and follow the message shown if it fails again.",
  connection_request_expired:
    "This connection request expired or its browser cookie is missing. Start a new connection and finish it in this tab.",
  connection_request_mismatch:
    "The connection request does not match this browser. Start a new connection and complete it using one tab.",
  authorization_code_missing:
    "The repair app did not return an authorization code. Start a new connection.",
  repair_configuration:
    "The repair connection settings are missing or invalid. Check REPAIR_SERVICE_URL, REPAIR_SERVICE_TOKEN and APP_ORIGIN in the receptionist's Production environment, then redeploy.",
  repair_credentials:
    "The repair app rejected the connection key. Set the receptionist's REPAIR_SERVICE_TOKEN to the same value as the repair app's RECEPTIONIST_API_TOKEN, redeploy both projects, then start a new connection.",
  repair_authorization_rejected:
    "The repair app could not validate this authorization. Start a new connection with your repair administrator account. If it repeats, check the connection keys and repair-app logs.",
  repair_unreachable:
    "The receptionist could not reach the repair app. Check that the repair deployment is Ready and available, then start a new connection.",
  repair_response:
    "The repair app returned an unexpected response. Check that REPAIR_SERVICE_URL uses the deployed repair website and that deployment protection is not blocking the integration.",
  admin_required:
    "This repair account is not an administrator. Sign in with your repair administrator account, then start a new connection.",
  session_store:
    "Your repair account was approved, but the receptionist could not save its sign-in session. Check the receptionist's database connection and sessions table, then start a new connection.",
} as const;

export type AuthorizationFailure = keyof typeof messages;
export class RepairAuthorizationError extends Error {
  constructor(
    public readonly reason: AuthorizationFailure,
    public readonly status?: number,
  ) {
    super(reason);
    this.name = "RepairAuthorizationError";
  }
}
export function authorizationMessage(value: string) {
  return Object.hasOwn(messages, value)
    ? messages[value as AuthorizationFailure]
    : messages.authorization;
}
