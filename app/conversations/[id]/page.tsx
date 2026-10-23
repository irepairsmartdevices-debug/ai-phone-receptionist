import { notFound } from "next/navigation";
import Link from "next/link";
import { getConversation } from "../../../src/persistence/conversations";
import { requireStaff } from "../../../src/auth/guards";
import DeleteConversation from "./remove";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const c = await getConversation(id);
  if (!c) notFound();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <Link href="/conversations">← CONVERSATIONS</Link>
          </div>
          <h1>Conversation details.</h1>
          <p>
            {new Date(c.created_at).toLocaleString("en-US", {
              timeZone: "America/Chicago",
            })}{" "}
            CT · {c.mode}
          </p>
        </div>
        <DeleteConversation id={id} />
      </div>
      <section className="panel">
        <div className="banner">
          {c.mode === "fixture"
            ? "Demo conversation · No real customer operations."
            : "Connected conversation · Repair service is the source of truth."}
        </div>
        <div className="chat" style={{ maxHeight: "none" }}>
          {c.messages.map((m) => (
            <div className={`message ${m.role}`} key={m.id}>
              <small>{m.role.toUpperCase()}</small>
              <br />
              {m.text}
            </div>
          ))}
        </div>
        <div className="stack">
          {c.outcomes.map(
            (outcome: {
              id: string;
              operation_id: string;
              result: { kind?: string; state?: string };
            }) => (
              <div key={outcome.id} className="settings-row">
                <div>
                  <strong>{outcome.result.kind ?? "Operation"}</strong>
                  <small>{outcome.operation_id}</small>
                </div>
                <span className="status">
                  {outcome.result.state ?? "Recorded"}
                </span>
              </div>
            ),
          )}
        </div>
        <p className="muted">
          Text retention: 30 days. Verification codes are redacted. Audio
          recording is off.
        </p>
      </section>
    </>
  );
}
