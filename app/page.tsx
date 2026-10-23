import Link from "next/link";
import { db } from "../src/persistence/db";
import { requireStaff } from "../src/auth/guards";
export const dynamic = "force-dynamic";
export default async function Home() {
  await requireStaff();
  const fixture = (process.env.RECEPTIONIST_MODE ?? "fixture") === "fixture";
  const counts = (
    await db.query(
      "SELECT (SELECT count(*)::int FROM conversations) AS conversations,(SELECT count(*)::int FROM outcomes WHERE result->>'kind'='BOOKING' AND result->>'state'='succeeded') AS bookings,(SELECT count(*)::int FROM outcomes WHERE result->>'kind'='STATUS_CHANGE' AND result->>'state'='succeeded') AS changes",
    )
  ).rows[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR FRONT DESK, REIMAGINED</div>
          <h1>A little more time for repairs.</h1>
          <p>Let your receptionist take care of the conversation.</p>
        </div>
        <Link className="button primary" href="/test">
          ⌁ Test receptionist <span>↗</span>
        </Link>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <div className="badge">
            <span className="dot" /> YOUR RECEPTIONIST WORKSPACE
          </div>
          <h2>
            Good conversations.
            <br />
            <em>Better service.</em>
          </h2>
          <p>
            Repair questions, appointments, and ticket updates.
            <br />
            One thoughtful experience for every customer.
          </p>
          <Link href="/test" className="button dark">
            Start a test conversation <span>→</span>
          </Link>
          <small>
            {fixture
              ? "Fixture mode · No real calls or customer data"
              : "Connected development · Local repair-service data"}
          </small>
        </div>
        <div className="voice-art" aria-hidden="true">
          <div className="orbit one" />
          <div className="orbit two" />
          <div className="voice-core">
            {[22, 40, 65, 36, 80, 50, 30, 65, 42, 22].map((h, i) => (
              <i key={i} style={{ height: h }} />
            ))}
          </div>
          <span className="floating top">✦ Here to help, around the clock</span>
          <span className="floating bottom">
            <span className="dot" /> A warmer welcome starts here
          </span>
        </div>
      </section>
      <div className="section-heading">
        <h2>At a glance</h2>
        <span>Development workspace</span>
      </div>
      <section className="stats">
        {[
          [
            "◌",
            "Conversations",
            String(counts.conversations),
            "Saved conversations in this workspace",
          ],
          [
            "▦",
            "Appointments",
            String(counts.bookings),
            fixture
              ? "Confirmed demo bookings"
              : "Confirmed repair-service bookings",
          ],
          ["⌕", "Ticket updates", "—", "Verified customer lookups"],
          [
            "↗",
            "Staff actions",
            String(counts.changes),
            "Authenticated and confirmed",
          ],
        ].map(([icon, label, value, detail]) => (
          <article className="stat" key={label}>
            <div className="stat-top">
              <span className="stat-icon">{icon}</span>
              <span>{label}</span>
            </div>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>
      <div className="two-column">
        <section className="panel">
          <div className="section-heading">
            <h2>Make it your receptionist</h2>
            <span className="pill">GET STARTED</span>
          </div>
          <p className="muted">A few steps toward a more connected shop.</p>
          <div className="setup-step">
            <span className="step-number done">✓</span>
            <div>
              <strong>Explore your test receptionist</strong>
              <p>Try questions, ticket lookups, and sample bookings.</p>
            </div>
            <Link href="/test">Try it →</Link>
          </div>
          <div className="setup-step">
            <span className="step-number">2</span>
            <div>
              <strong>Connect your repair software</strong>
              <p>Bring your real catalog and ticket statuses together.</p>
            </div>
            <Link href="/settings">Configure →</Link>
          </div>
          <div className="setup-step">
            <span className="step-number">3</span>
            <div>
              <strong>Welcome your first caller</strong>
              <p>Configure your phone provider after integration testing.</p>
            </div>
            <span className="muted">Later</span>
          </div>
        </section>
        <section className="panel capabilities">
          <span className="feature-icon">✦</span>
          <h2>
            A helpful voice.
            <br />A capable assistant.
          </h2>
          <p>Built around the way your repair shop works.</p>
          <ul>
            <li>Answers grounded in your shop’s information</li>
            <li>Available appointment times, confirmed first</li>
            <li>Private ticket updates with verification</li>
            <li>Staff-only changes with a clear audit trail</li>
          </ul>
          <div className="note">
            <span className="dot amber" /> Demo data only. Repair service is not
            connected.
          </div>
        </section>
      </div>
    </>
  );
}
