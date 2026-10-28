"use client";
import { useState } from "react";
import type { AIReadiness } from "../../src/providers/readiness";

const reasons: Record<string, string> = {
  configuration: "Check the selected AI provider and model in Vercel.",
  missing_key: "Add this provider's API key in Vercel, then redeploy.",
  authentication:
    "The provider rejected the API key. Check its access, then redeploy after updating it.",
  model:
    "The provider rejected the model or request settings. Check the configured model in Vercel.",
  quota:
    "The provider's usage limit was reached. Check your Google or OpenAI account's quota and billing.",
  timeout:
    "The check timed out. Open Test details below to see where it stopped.",
  unavailable:
    "The AI provider could not be reached. Please try again shortly.",
  response:
    "The AI provider returned an unsupported response. Check the model and try again.",
};
const parameterNames = {
  thinking_level: "thinking level",
  thinking_budget: "thinking budget",
  response_schema: "structured response schema",
  response_mime_type: "response format",
  max_output_tokens: "output token limit",
  temperature: "temperature",
  system_instruction: "system instructions",
  generation_config: "generation settings",
};
export default function AIConnection({ initial }: { initial: AIReadiness }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const name =
    state.provider === "gemini"
      ? "Gemini"
      : state.provider === "openai"
        ? "OpenAI"
        : "AI";
  async function check() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/ai/check", { method: "POST" });
      const data = await response.json();
      if (
        data &&
        typeof data.configured === "boolean" &&
        ["gemini", "openai", "none"].includes(data.provider)
      )
        setState(data);
      if (response.status === 429)
        setMessage(
          `Please wait ${response.headers.get("Retry-After") ?? "45"} seconds before another check.`,
        );
      else if (!response.ok && data?.error)
        setMessage(
          "The check could not finish. Sign in as administrator and try again.",
        );
    } catch {
      setMessage("The check could not finish. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-labelledby="ai-connection-heading">
      <div className="section-heading">
        <h2 id="ai-connection-heading">AI connection</h2>
        <span>ADMINISTRATOR</span>
      </div>
      <p>
        {name}
        {state.model ? ` · ${state.model}` : ""}
      </p>
      <p role="status">
        {state.lastCheck
          ? state.lastCheck.ok
            ? "Connection check passed."
            : "Connection check failed."
          : state.configured
            ? "Configured · connection not yet checked."
            : "API key is not configured for this provider."}
      </p>
      {state.lastCheck && (
        <p>
          Last checked:{" "}
          <time dateTime={state.lastCheck.checkedAt}>
            {state.lastCheck.checkedAt
              .replace("T", " ")
              .replace(/\.\d+Z$/, " UTC")}
          </time>
        </p>
      )}
      {(!state.configured || (state.lastCheck && !state.lastCheck.ok)) && (
        <p role="alert">
          {reasons[
            state.lastCheck?.reason ?? state.reason ?? "configuration"
          ] ?? reasons.configuration}
        </p>
      )}
      {message && <p role="alert">{message}</p>}
      {state.lastCheck?.diagnostic && (
        <details>
          <summary>Test details</summary>
          <p>
            Waited: {(state.lastCheck.diagnostic.elapsedMs / 1000).toFixed(1)}{" "}
            seconds
          </p>
          <p>
            {state.lastCheck.diagnostic.source === "app_deadline"
              ? state.lastCheck.diagnostic.phase === "request"
                ? "The app reached its waiting limit before a response arrived."
                : "The app reached its waiting limit while reading the response."
              : state.lastCheck.diagnostic.source === "provider_http"
                ? "The provider returned an error response."
                : state.lastCheck.diagnostic.source === "transport"
                  ? "The app could not finish connecting to the provider."
                  : state.lastCheck.diagnostic.source === "response"
                    ? "The provider response could not be verified."
                    : "The provider returned a valid test response."}
          </p>
          {state.lastCheck.diagnostic.httpStatus !== undefined && (
            <p>
              Provider response: HTTP {state.lastCheck.diagnostic.httpStatus}
            </p>
          )}
          {state.lastCheck.diagnostic.networkCode && (
            <p>Connection code: {state.lastCheck.diagnostic.networkCode}</p>
          )}
          {state.lastCheck.diagnostic.providerCode && (
            <p>Provider code: {state.lastCheck.diagnostic.providerCode}</p>
          )}
          {state.lastCheck.diagnostic.providerReason && (
            <p>Provider reason: {state.lastCheck.diagnostic.providerReason}</p>
          )}
          {Boolean(state.lastCheck.diagnostic.parameters?.length) && (
            <p>
              Setting mentioned:{" "}
              {state.lastCheck.diagnostic.parameters
                ?.map((name) => parameterNames[name])
                .join(", ")}
            </p>
          )}
        </details>
      )}
      <button
        type="button"
        className="button primary"
        onClick={check}
        disabled={busy || !state.configured}
      >
        {busy ? "Checking…" : `Test ${name} connection`}
      </button>
      <p className="muted">
        Allow up to 30 seconds for this check. It sends a small test request to
        your selected AI provider. Your API key stays private.
      </p>
    </section>
  );
}
