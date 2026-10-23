"use client";
import { useState } from "react";
export default function SettingsForm({
  initial,
}: {
  initial: { businessName: string; greeting: string; transferNumber: string };
}) {
  const [status, setStatus] = useState("");
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        try {
          const r = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(form.entries())),
          });
          setStatus(r.ok ? "Settings saved." : "Settings could not be saved.");
        } catch {
          setStatus("Settings could not be saved.");
        }
      }}
    >
      <label>
        Business name
        <input
          name="businessName"
          defaultValue={initial.businessName}
          required
          maxLength={100}
        />
      </label>
      <label>
        Transfer destination
        <input
          name="transferNumber"
          defaultValue={initial.transferNumber}
          placeholder="Not configured"
          maxLength={30}
        />
      </label>
      <label className="wide">
        Greeting
        <textarea
          name="greeting"
          defaultValue={initial.greeting}
          required
          maxLength={500}
        />
      </label>
      <div className="wide">
        <button className="button primary">Save settings</button>
        <span role="status" className="muted" style={{ marginLeft: 15 }}>
          {status}
        </span>
      </div>
    </form>
  );
}
