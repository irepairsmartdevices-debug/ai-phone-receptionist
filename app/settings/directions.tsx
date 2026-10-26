"use client";
import { useState, type FormEvent } from "react";
import type { Business } from "../../src/contracts/repair";
import type { StoreGuide } from "../../src/conversation/assistant-types";
import type { StoreDirectionsSnapshot } from "../../src/persistence/store-directions";
import styles from "./directions.module.css";
export default function StoreDirectionsForm({
  initial,
  sourceLocations,
}: {
  initial: StoreDirectionsSnapshot;
  sourceLocations: Business["locations"];
}) {
  const [snapshot, setSnapshot] = useState(initial),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  function edit(id: string, patch: Partial<StoreGuide>) {
    setSnapshot((s) => ({
      ...s,
      locations: s.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
    setStatus("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/store-directions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error ?? "Store directions could not be saved.");
      setSnapshot(data);
      setStatus(
        "Store directions saved. The next location question will use these details.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Store directions could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/store-directions", {
        cache: "no-store",
      });
      if (!response.ok)
        throw Error(
          "Unable to reload directions. Sign in again if your session expired.",
        );
      setSnapshot(await response.json());
      setStatus("Saved store directions reloaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reload directions.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className={styles.form}>
      <p className="section-intro">
        Save your full store addresses and helpful landmarks. The receptionist
        will use these facts when customers ask for directions. Leave an address
        empty until you have confirmed it.
      </p>
      {snapshot.locations.map((location, index) => {
        const linked = sourceLocations.find(
          (l) => l.id === location.sourceLocationId,
        );
        return (
          <fieldset key={location.id} className={styles.store} disabled={busy}>
            <legend>
              Store {index + 1}
              {location.name ? ` · ${location.name}` : ""}
            </legend>
            <div className="form-grid">
              <label>
                Location name
                <input
                  value={location.name}
                  onChange={(e) => edit(location.id, { name: e.target.value })}
                  required
                  maxLength={120}
                  placeholder="Dallas"
                />
              </label>
              <label>
                Linked repair-app location
                <select
                  value={location.sourceLocationId ?? ""}
                  onChange={(e) => {
                    const source = sourceLocations.find(
                      (l) => l.id === e.target.value,
                    );
                    edit(location.id, {
                      sourceLocationId: source?.id,
                      address: source?.address ?? location.address,
                      ...(!location.name && source
                        ? { name: source.name }
                        : {}),
                    });
                  }}
                >
                  <option value="">Standalone store directions</option>
                  {sourceLocations.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                  {location.sourceLocationId && !linked && (
                    <option value={location.sourceLocationId}>
                      Linked location currently unavailable
                    </option>
                  )}
                </select>
              </label>
              <label className="wide">
                Full address
                <input
                  value={
                    location.sourceLocationId
                      ? (linked?.address ?? "")
                      : location.address
                  }
                  readOnly={!!location.sourceLocationId}
                  onChange={(e) =>
                    edit(location.id, { address: e.target.value })
                  }
                  maxLength={600}
                  placeholder="Street address, suite, city, state and ZIP"
                />
              </label>
              {linked && (
                <p className="wide muted">
                  This location uses its latest address from your repair
                  software. Its landmarks below stay under your control.
                </p>
              )}
              <label className="wide">
                Landmark directions
                <textarea
                  aria-label="Landmark directions"
                  value={location.landmarks}
                  onChange={(e) =>
                    edit(location.id, { landmarks: e.target.value })
                  }
                  maxLength={1200}
                  placeholder="Across from RedBird Mall, in the same complex as Hair Depot."
                />
              </label>
            </div>
            <button
              type="button"
              className="button"
              aria-label={`Remove store: ${location.name || "Unnamed store"}`}
              onClick={() => {
                if (
                  window.confirm(
                    `Remove ${location.name || "this store"} from your saved store directions?`,
                  )
                )
                  setSnapshot((s) => ({
                    ...s,
                    locations: s.locations.filter((l) => l.id !== location.id),
                  }));
              }}
            >
              Remove store
            </button>
          </fieldset>
        );
      })}
      {!snapshot.locations.length && (
        <p className="muted">
          No saved store directions. Add a store below. Connected repair-app
          locations remain available.
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className="button"
          disabled={busy || snapshot.locations.length >= 20}
          onClick={() =>
            setSnapshot((s) => ({
              ...s,
              locations: [
                ...s.locations,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  address: "",
                  landmarks: "",
                },
              ],
            }))
          }
        >
          Add store
        </button>
        <button className="button primary" disabled={busy}>
          Save store directions
        </button>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={reload}
        >
          Reload saved directions
        </button>
      </div>
      {status && (
        <p role="status" className={styles.status}>
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </form>
  );
}
