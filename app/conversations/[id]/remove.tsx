"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export default function DeleteConversation({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      {error && <span role="alert">{error}</span>}
      <button
        className="chip"
        onClick={async () => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          const r = await fetch("/api/retention", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          if (r.ok) {
            router.push("/conversations");
            router.refresh();
          } else setError("Could not delete conversation.");
        }}
      >
        {confirm ? "Confirm delete?" : "Delete conversation"}
      </button>
    </div>
  );
}
