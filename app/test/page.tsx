import TestClient from "./client";
import { requireStaff } from "../../src/auth/guards";
export const dynamic = "force-dynamic";
export default async function TestPage() {
  const fixture = (process.env.RECEPTIONIST_MODE ?? "fixture") === "fixture";
  await requireStaff();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A LITTLE PRACTICE, A BETTER EXPERIENCE</div>
          <h1>Say hello to your receptionist.</h1>
          <p>Try the conversation before your customers do.</p>
        </div>
      </div>
      <div className="banner">
        {fixture
          ? "Fixture mode · Fictional tickets and appointments only. No real calls, texts, bookings, or ticket changes."
          : "Connected mode · Operations use your repair software. Confirmations can create bookings or change tickets."}
      </div>
      <TestClient fixture={fixture} />
    </>
  );
}
