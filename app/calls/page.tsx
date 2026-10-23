import { requireStaff } from "../../src/auth/guards";
import { db } from "../../src/persistence/db";
import PairCall from "./pair";
export const dynamic = "force-dynamic";
export default async function Calls() {
  await requireStaff();
  const { rows } = await db.query(
    "SELECT call_sid,created_at,paired_session IS NOT NULL AS paired FROM voice_calls WHERE created_at>now()-interval '1 hour' ORDER BY created_at DESC LIMIT 30",
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">AUTHENTICATED STAFF CALLS</div>
          <h1>Keep your team connected.</h1>
          <p>
            Ask the phone assistant to “pair staff”, then enter its code here.
          </p>
        </div>
      </div>
      <section className="panel">
        {rows.length ? (
          rows.map((c) => (
            <div key={c.call_sid} className="settings-row">
              <div>
                <strong>Call …{c.call_sid.slice(-8)}</strong>
                <small>
                  {c.paired
                    ? "Paired to a staff session"
                    : "Customer mode until paired"}
                </small>
              </div>
              <PairCall callSid={c.call_sid} />
            </div>
          ))
        ) : (
          <p className="muted">
            No recent calls. Live calling requires deployment and phone-provider
            configuration.
          </p>
        )}
      </section>
    </>
  );
}
