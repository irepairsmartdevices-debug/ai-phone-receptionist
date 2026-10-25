"use client";
import { useEffect, useRef, useState } from "react";
type Message = { role: string; text: string };
export default function TestClient({ fixture = true }: { fixture?: boolean }) {
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
      {
        role: "assistant",
        text: fixture
          ? "Hi, I’m your AI repair assistant. This is a demo conversation with fictional shop data. How can I help you today?"
          : "Hi, I’m your AI repair assistant. How can I help you today?",
      },
    ]),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [role, setRole] = useState("customer"),
    [id, setId] = useState<string>();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch("/api/test-conversations")
      .then((r) => r.json())
      .then((d) => {
        if (d.id) {
          setId(d.id);
          setMessages(d.messages);
        }
      })
      .catch(() => setError("Conversation history could not be loaded."))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);
  async function send(value = text) {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError("");
    setText("");
    try {
      const response = await fetch("/api/test-conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, id, testRole: role }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setId(data.id);
      setMessages((m) => [
        ...m,
        { role: "user", text: value.replace(/\b\d{6}\b/g, "[code redacted]") },
        { role: "assistant", text: data.text },
      ]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The message could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="two-column">
      <section className="panel">
        <div className="section-heading">
          <h2>Meet your receptionist</h2>
          <span className="status">
            {fixture ? "SIMULATOR" : "CONNECTED TEST"}
          </span>
        </div>
        <div className="chat" aria-live="polite">
          {messages.map((m, i) => (
            <div className={`message ${m.role}`} key={i}>
              {m.text}
            </div>
          ))}
          {busy && <div className="message">Thinking…</div>}
          <div ref={end} />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="chips">
          {[
            "What are your hours?",
            "How much is screen repair?",
            "Check a ticket",
            "Book an appointment",
          ].map((t) => (
            <button
              className="chip"
              key={t}
              disabled={busy}
              onClick={() => send(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            disabled={!ready}
            aria-label="Message"
            placeholder="Ask your receptionist…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
          />
          <button
            className="button primary"
            aria-label="Send message"
            disabled={busy || !text.trim()}
          >
            Send ↗
          </button>
        </form>
      </section>
      <div className="stack">
        <section className="panel">
          <div className="section-heading">
            <h2>Your test space</h2>
            <span>✦</span>
          </div>
          <p className="section-intro">
            {fixture
              ? "Explore the experience before connecting real customer data. Every result here is a demonstration."
              : "This workspace is connected to your repair service. Changes require your authenticated admin account."}
          </p>
          <label>
            Test as
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                void send("restart");
              }}
            >
              <option value="customer">Customer · ticket reads only</option>
              <option value="staff">
                {fixture
                  ? "Demo admin · confirmed changes"
                  : "Authenticated admin · confirmed changes"}
              </option>
            </select>
          </label>
          <div className="settings-row">
            <div>
              <strong>
                {fixture ? "Sample ticket" : "Ticket information"}
              </strong>
              <small>
                {fixture
                  ? "1001 · Confirmed repair"
                  : "Enter your exact repair ticket reference."}
              </small>
            </div>
            <span className="status">{fixture ? "Demo" : "Connected"}</span>
          </div>
          <div className="settings-row">
            <div>
              <strong>
                {fixture ? "Demo verification code" : "Customer verification"}
              </strong>
              <small>
                {fixture
                  ? "123456 · No real text is sent"
                  : "A code is sent to the ticket’s registered contact."}
              </small>
            </div>
          </div>
          <p className="section-intro">
            {fixture
              ? "Try “cancel ticket” in demo admin mode to preview confirmation."
              : "Authenticated administrators can request a confirmed cancellation."}
            Other status transitions keep your repair app’s intake and checkout
            requirements.
          </p>
          <button
            className="chip"
            onClick={() => send("restart")}
            disabled={busy}
          >
            ↺ Restart conversation
          </button>
        </section>
        <CallbackForm id={id} />
      </div>
    </div>
  );
}
function CallbackForm({ id }: { id?: string }) {
  const [status, setStatus] = useState("");
  return (
    <section className="panel">
      <h2 style={{ fontSize: 15 }}>Leave a callback message</h2>
      <p className="section-intro">
        A fallback when a question needs the team.
      </p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setStatus("Saving…");
          try {
            const r = await fetch("/api/callbacks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                conversationId: id ?? "demo",
                name: f.get("name"),
                phone: f.get("phone"),
                message: f.get("message"),
              }),
            });
            setStatus(
              r.ok
                ? "Demo message saved for review."
                : "Message could not be saved.",
            );
          } catch {
            setStatus("Message could not be saved.");
          }
        }}
      >
        <label>
          Name
          <input name="name" required maxLength={100} />
        </label>
        <label>
          Phone
          <input name="phone" required maxLength={30} />
        </label>
        <label>
          Message
          <textarea name="message" required maxLength={2000} />
        </label>
        <button className="button primary">Save demo message</button>
        <span role="status" className="muted">
          {status}
        </span>
      </form>
    </section>
  );
}
