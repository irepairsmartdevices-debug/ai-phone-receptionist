import Link from "next/link";
import { db } from "../../src/persistence/db";
import { requireStaff } from "../../src/auth/guards";
export const dynamic = "force-dynamic";
export default async function Conversations() {
  await requireStaff();
  const { rows } = await db.query(
    "SELECT c.id,c.mode,c.created_at,count(m.id)::int as messages FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100",
  );
  const callbacks = await db.query(
    "SELECT * FROM callbacks ORDER BY created_at DESC LIMIT 50",
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVERY CONVERSATION, IN ONE PLACE</div>
          <h1>A little context goes a long way.</h1>
          <p>Review what your receptionist and customers discussed.</p>
        </div>
        <Link className="button primary" href="/test">
          New test conversation ↗
        </Link>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Recent conversations</h2>
          <span>{rows.length} conversations</span>
        </div>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>CONVERSATION</th>
                <th>STARTED</th>
                <th>MESSAGES</th>
                <th>MODE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/conversations/${r.id}`}>
                      Conversation {r.id.slice(0, 8)} ↗
                    </Link>
                  </td>
                  <td>
                    {new Date(r.created_at).toLocaleString("en-US", {
                      timeZone: "America/Chicago",
                    })}{" "}
                    CT
                  </td>
                  <td>{r.messages}</td>
                  <td>
                    <span className="status">{r.mode}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">
            <h2>Your next conversation starts here.</h2>
            <p>Try the receptionist to see your first conversation.</p>
          </div>
        )}
      </section>
      <section className="panel" style={{ marginTop: 22 }}>
        <h2 style={{ fontSize: 15 }}>Callback messages</h2>
        {callbacks.rows.length ? (
          callbacks.rows.map((r) => (
            <div className="settings-row" key={r.id}>
              <div>
                <strong>
                  {r.name} · {r.phone}
                </strong>
                <p className="muted">{r.message}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">No callback messages yet.</p>
        )}
      </section>
    </>
  );
}
