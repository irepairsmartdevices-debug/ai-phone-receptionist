"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { Business } from "../../src/contracts/repair";
import type {
  CustomAnswer,
  ManualPrice,
  KnowledgeSnapshot,
} from "../../src/knowledge/types";
import styles from "./knowledge.module.css";

type SourceOffering = Business["offerings"][number] & {
  category?: string;
  brand?: string;
  model?: string;
};
const emptyAnswer = { question: "", variations: "", answer: "" };
const emptyPrice = {
  category: "Phone",
  brand: "",
  model: "",
  repair: "",
  amount: "",
  sourceOfferingId: "",
};
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export default function KnowledgeClient({
  initial,
  sourceOfferings,
  sourceAvailable,
  fixture,
  semanticAvailable,
}: {
  initial: KnowledgeSnapshot;
  sourceOfferings: SourceOffering[];
  sourceAvailable: boolean;
  fixture: boolean;
  semanticAvailable: boolean;
}) {
  const [knowledge, setKnowledge] = useState(initial);
  const [answer, setAnswer] = useState(emptyAnswer);
  const [answerEditing, setAnswerEditing] = useState<string | undefined>();
  const [price, setPrice] = useState(emptyPrice);
  const [priceEditing, setPriceEditing] = useState<string | undefined>();
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  async function save(
    method: "POST" | "PUT" | "DELETE",
    payload: Record<string, unknown>,
  ) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/knowledge", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "The entry could not be saved.");
      setKnowledge({ answers: data.answers, prices: data.prices });
      setStatus(
        method === "DELETE"
          ? "Entry deleted. Future replies will use the remaining entries."
          : "Saved. Your receptionist will use this on the next conversation turn.",
      );
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Please try again.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submitAnswer(event: FormEvent) {
    event.preventDefault();
    if (
      await save(answerEditing ? "PUT" : "POST", {
        kind: "answer",
        ...(answerEditing ? { id: answerEditing } : {}),
        question: answer.question,
        variations: answer.variations
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        answer: answer.answer,
      })
    ) {
      setAnswer(emptyAnswer);
      setAnswerEditing(undefined);
    }
  }
  async function submitPrice(event: FormEvent) {
    event.preventDefault();
    if (!/^\d+(?:\.\d{1,2})?$/.test(price.amount.trim())) {
      setError("Enter a USD price with no more than two decimal places.");
      return;
    }
    const cents = Math.round(Number(price.amount) * 100);
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000000) {
      setError("Enter a price from $0 to $1,000,000.");
      return;
    }
    const { amount, sourceOfferingId, ...identity } = price;
    if (
      await save(priceEditing ? "PUT" : "POST", {
        kind: "price",
        ...(priceEditing ? { id: priceEditing } : {}),
        ...identity,
        priceCents: cents,
        ...(sourceOfferingId ? { sourceOfferingId } : {}),
      })
    ) {
      setPrice(emptyPrice);
      setPriceEditing(undefined);
    }
  }
  async function remove(kind: "answer" | "price", id: string) {
    if (
      !window.confirm(
        kind === "answer"
          ? "Delete this custom answer? It will no longer be used in future replies."
          : "Delete this manual estimate? Any linked override will be removed, restoring the repair-software estimate.",
      )
    )
      return;
    if (await save("DELETE", { kind, id })) {
      if (answerEditing === id) {
        setAnswer(emptyAnswer);
        setAnswerEditing(undefined);
      }
      if (priceEditing === id) {
        setPrice(emptyPrice);
        setPriceEditing(undefined);
      }
    }
  }
  function editAnswer(row: CustomAnswer) {
    setAnswerEditing(row.id);
    setAnswer({
      question: row.question,
      variations: row.variations.join("\n"),
      answer: row.answer,
    });
    document.getElementById("question")?.focus();
  }
  function editPrice(row: ManualPrice) {
    setPriceEditing(row.id);
    setPrice({
      category: row.category,
      brand: row.brand,
      model: row.model,
      repair: row.repair,
      amount: (row.priceCents / 100).toFixed(2),
      sourceOfferingId: row.sourceOfferingId ?? "",
    });
    document.getElementById("price-category")?.focus();
  }
  function linkSource(id: string) {
    const source = sourceOfferings.find((o) => o.id === id);
    if (source)
      setPrice((p) => ({
        ...p,
        sourceOfferingId: id,
        category: source.category ?? p.category,
        brand: source.brand ?? p.brand,
        model: source.model ?? source.device,
        repair: source.service,
        amount: String(source.price),
      }));
    else setPrice((p) => ({ ...p, sourceOfferingId: "" }));
  }
  return (
    <div className="stack">
      <div className={styles.intro}>
        <p>
          Only administrators can change this knowledge. Saved prices are
          estimates, subject to inspection.
        </p>
        <Link href="/test" className="button primary">
          Test your receptionist →
        </Link>
      </div>
      {status && (
        <p className={styles.success} role="status">
          {status}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <section className="panel" aria-labelledby="answers-heading">
        <div className="section-heading">
          <h2 id="answers-heading">Custom questions & answers</h2>
          <span>ADMIN ONLY</span>
        </div>
        <p className="section-intro">
          Write the question and the answer you want customers to hear. Add
          other ways a customer might ask it, one per line.
        </p>
        <p className={styles.note}>
          {semanticAvailable
            ? "AI matching is configured to recognize similar questions using your saved answers."
            : "Saved questions and alternate phrasings work now. Connect your AI provider to recognize more ways of asking the same question."}
        </p>
        <form onSubmit={submitAnswer} className="form-grid">
          <label className="wide">
            Question
            <input
              id="question"
              name="question"
              value={answer.question}
              onChange={(e) =>
                setAnswer({ ...answer, question: e.target.value })
              }
              required
              maxLength={500}
              placeholder="Do you repair water-damaged phones?"
            />
          </label>
          <label className="wide">
            Alternate phrasings (one per line)
            <textarea
              name="variations"
              value={answer.variations}
              onChange={(e) =>
                setAnswer({ ...answer, variations: e.target.value })
              }
              maxLength={7515}
              placeholder="My phone got wet&#10;Can you fix liquid damage?"
            />
          </label>
          <label className="wide">
            Approved answer
            <textarea
              name="answer"
              value={answer.answer}
              onChange={(e) => setAnswer({ ...answer, answer: e.target.value })}
              required
              maxLength={4000}
              placeholder="We inspect liquid-damaged devices. Bring yours in so we can assess it."
            />
          </label>
          <div className={`wide ${styles.actions}`}>
            <button className="button primary" disabled={busy}>
              {answerEditing ? "Save answer changes" : "Add answer"}
            </button>
            {answerEditing && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setAnswer(emptyAnswer);
                  setAnswerEditing(undefined);
                }}
              >
                Cancel answer edit
              </button>
            )}
          </div>
        </form>
        <div className={styles.list}>
          {knowledge.answers.length === 0 ? (
            <p className="muted">
              No custom answers yet. Add your first question above.
            </p>
          ) : (
            knowledge.answers.map((row) => (
              <article key={row.id} className={styles.item}>
                <h3>{row.question}</h3>
                <p className={styles.answer}>{row.answer}</p>
                {row.variations.length > 0 && (
                  <p className="muted">
                    Also asked as: {row.variations.join(" · ")}
                  </p>
                )}
                <div className={styles.actions}>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => editAnswer(row)}
                    aria-label={`Edit answer: ${row.question}`}
                  >
                    Edit answer
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => remove("answer", row.id)}
                    aria-label={`Delete answer: ${row.question}`}
                  >
                    Delete answer
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      <section className="panel" aria-labelledby="prices-heading">
        <div className="section-heading">
          <h2 id="prices-heading">Your repair estimates</h2>
          <span>MANUAL PRICES</span>
        </div>
        <p className="section-intro">
          Add a price for an exact brand, model and repair. The receptionist
          asks for missing details before quoting. These estimates do not create
          bookable repairs or change prices in your repair software.
        </p>
        <form onSubmit={submitPrice} className="form-grid">
          <label>
            Device category
            <input
              id="price-category"
              value={price.category}
              onChange={(e) => setPrice({ ...price, category: e.target.value })}
              required
              maxLength={120}
              placeholder="Phone"
            />
          </label>
          <label>
            Brand
            <input
              value={price.brand}
              onChange={(e) => setPrice({ ...price, brand: e.target.value })}
              required
              maxLength={120}
              placeholder="Apple"
            />
          </label>
          <label>
            Exact model
            <input
              value={price.model}
              onChange={(e) => setPrice({ ...price, model: e.target.value })}
              required
              maxLength={120}
              placeholder="iPhone 14 Pro"
            />
          </label>
          <label>
            Repair type
            <input
              value={price.repair}
              onChange={(e) => setPrice({ ...price, repair: e.target.value })}
              required
              maxLength={120}
              placeholder="Screen repair"
            />
          </label>
          <label>
            Estimate (USD)
            <input
              inputMode="decimal"
              value={price.amount}
              onChange={(e) => setPrice({ ...price, amount: e.target.value })}
              required
              maxLength={12}
              placeholder="149.99"
            />
          </label>
          <label>
            Override a catalog estimate (optional)
            <select
              value={price.sourceOfferingId}
              onChange={(e) => linkSource(e.target.value)}
            >
              <option value="">Independent manual estimate</option>
              {sourceOfferings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.brand ? o.brand + " " : ""}
                  {o.model ?? o.device} · {o.service} ·{" "}
                  {money(Math.round(o.price * 100))}
                </option>
              ))}
              {price.sourceOfferingId &&
                !sourceOfferings.some(
                  (o) => o.id === price.sourceOfferingId,
                ) && (
                  <option value={price.sourceOfferingId}>
                    Linked catalog entry is unavailable
                  </option>
                )}
            </select>
          </label>
          {price.sourceOfferingId && (
            <p className={`wide ${styles.note}`}>
              This explicitly overrides the receptionist’s quote for the linked
              catalog entry. Booking still uses the repair-software price and
              requires customer review. Delete this override to restore the
              catalog estimate.
            </p>
          )}
          <div className={`wide ${styles.actions}`}>
            <button className="button primary" disabled={busy}>
              {priceEditing ? "Save price changes" : "Add repair price"}
            </button>
            {priceEditing && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setPrice(emptyPrice);
                  setPriceEditing(undefined);
                }}
              >
                Cancel price edit
              </button>
            )}
          </div>
        </form>
        <div className={styles.list}>
          {knowledge.prices.length === 0 ? (
            <p className="muted">
              No manual repair prices yet. Your connected catalog remains
              available below.
            </p>
          ) : (
            knowledge.prices.map((row) => (
              <article key={row.id} className={styles.item}>
                <div className={styles.row}>
                  <h3>
                    {row.brand} {row.model} · {row.repair}
                  </h3>
                  <strong>{money(row.priceCents)}</strong>
                </div>
                <p className="muted">
                  {row.category} ·{" "}
                  {row.sourceOfferingId
                    ? "Manual quote override"
                    : "Manual estimate"}
                </p>
                <div className={styles.actions}>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => editPrice(row)}
                    aria-label={`Edit price: ${row.brand} ${row.model} ${row.repair}`}
                  >
                    Edit price
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => remove("price", row.id)}
                    aria-label={`Delete price: ${row.brand} ${row.model} ${row.repair}`}
                  >
                    Delete price
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      <section className="panel" aria-labelledby="source-heading">
        <div className="section-heading">
          <h2 id="source-heading">
            {fixture ? "Demo catalog" : "Repair software prices"}
          </h2>
          <span>{fixture ? "SAMPLE DATA" : "READ FROM REPAIR SOFTWARE"}</span>
        </div>
        <p className="section-intro">
          {fixture
            ? "These are fictional sample prices. Connect your repair software to load its real catalog here."
            : "These current prices come from your repair software. Edit or remove the original entries in that application."}
        </p>
        {!sourceAvailable ? (
          <p role="status">
            The repair catalog is unavailable. Your manual entries are still
            saved; refresh when the connection is restored.
          </p>
        ) : sourceOfferings.length === 0 ? (
          <p className="muted">No catalog prices are available yet.</p>
        ) : (
          <div className={styles.list}>
            {sourceOfferings.map((o) => (
              <article key={o.id} className={styles.item}>
                <div className={styles.row}>
                  <h3>
                    {o.brand ? o.brand + " " : ""}
                    {o.model ?? o.device} · {o.service}
                  </h3>
                  <strong>{money(Math.round(o.price * 100))}</strong>
                </div>
                <p className="muted">
                  {o.category ?? "Device category not supplied"} ·{" "}
                  {knowledge.prices.some((p) => p.sourceOfferingId === o.id)
                    ? "Manual quote override is active"
                    : "Catalog estimate"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
