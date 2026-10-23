"use client";
import { useState } from "react";
export default function PairCall({ callSid }: { callSid: string }) {
  const [status, setStatus] = useState("");
  return (
    <form
      className="chat-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const r = await fetch("/api/voice/pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callSid, code: form.get("code") }),
        });
        setStatus(
          r.ok
            ? "Paired to your authenticated staff session."
            : "Pairing failed. Check the code and sign-in.",
        );
      }}
    >
      <input
        name="code"
        required
        pattern="[0-9]{6}"
        placeholder="Pairing code"
        aria-label="Call pairing code"
      />
      <button className="button primary">Pair</button>
      <span role="status" className="muted">
        {status}
      </span>
    </form>
  );
}
