import Link from "next/link";
import { db } from "../../src/persistence/db";
import { requireAdmin } from "../../src/auth/guards";
import SettingsForm from "./client";
import StoreDirectionsForm from "./directions";
import { getStoreDirections } from "../../src/persistence/store-directions";
import { getService } from "../../src/repair/service";
import type { Business } from "../../src/contracts/repair";
export const dynamic = "force-dynamic";
export default async function Settings() {
  const fixture = (process.env.RECEPTIONIST_MODE ?? "fixture") === "fixture";
  await requireAdmin();
  const { rows } = await db.query(
    "SELECT value FROM settings WHERE key='profile'",
  );
  const initial = rows[0]?.value ?? {
    businessName: "Repair Studio",
    greeting: "Hi, I’m your AI repair assistant. How can I help you today?",
    transferNumber: "",
  };
  const directions = await getStoreDirections();
  let sourceLocations: Business["locations"] = [];
  try {
    const source = await getService().business();
    if (source.ok) sourceLocations = source.value.locations;
  } catch {
    /* Manual store directions remain editable while the repair service is unavailable. */
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            A RECEPTIONIST THAT FEELS LIKE YOUR SHOP
          </div>
          <h1>Make it yours.</h1>
          <p>Your business, your greeting, your connections.</p>
        </div>
      </div>
      <p>
        <Link className="button" href="/knowledge">
          Manage questions, answers &amp; repair prices →
        </Link>
      </p>
      <div className="stack">
        <section className="panel">
          <div className="section-heading">
            <h2>Business profile</h2>
            <span>ADMINISTRATOR</span>
          </div>
          <p className="section-intro">
            Save your preferences for this workspace. Fixture conversations use
            fictional catalog data until the repair service is connected.
          </p>
          <SettingsForm initial={initial} />
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Store directions</h2>
            <span>ADMINISTRATOR</span>
          </div>
          <StoreDirectionsForm
            initial={directions}
            sourceLocations={sourceLocations}
          />
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>Connections & readiness</h2>
            <span>{fixture ? "DEMO WORKSPACE" : "CONNECTED WORKSPACE"}</span>
          </div>
          {[
            [
              "Repair software",
              "Secure integration endpoints are required in your repair app.",
              fixture ? "Fixture only" : "Connected",
            ],
            [
              "Phone provider",
              "Connect a Twilio number after local integration tests.",
              "Not configured",
            ],
            [
              "AI provider",
              "Uses your saved shop information to guide follow-up questions.",
              process.env.AI_PROVIDER_KEY
                ? "Configured · live test required"
                : "Test mode",
            ],
            [
              "Customer verification",
              "Demo code only; no real customer messages are sent.",
              fixture ? "Fixture only" : "Registered-contact verification",
            ],
            ["Audio recording", "Recording is disabled by default.", "Off"],
            [
              "Conversation retention",
              "Text is retained for 30 days; manual deletion is available.",
              "30 days",
            ],
          ].map(([name, detail, status]) => (
            <div className="settings-row" key={name}>
              <div>
                <strong>{name}</strong>
                <small>{detail}</small>
              </div>
              <span className="status">{status}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
