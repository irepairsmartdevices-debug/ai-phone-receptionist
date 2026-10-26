import { requireAdmin } from "../../src/auth/guards";
import { getKnowledge } from "../../src/knowledge/store";
import { getService } from "../../src/repair/service";
import KnowledgeClient from "./client";
export const dynamic = "force-dynamic";
export default async function KnowledgePage() {
  await requireAdmin();
  const knowledge = await getKnowledge();
  let source;
  try {
    source = await getService().business();
  } catch {
    source = undefined;
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR SHOP’S KNOWLEDGE</div>
          <h1>Questions, answers & repair prices</h1>
          <p>
            Teach your receptionist what to say and which device-specific
            estimates to use.
          </p>
        </div>
      </div>
      <KnowledgeClient
        initial={knowledge}
        sourceOfferings={source?.ok ? source.value.offerings : []}
        sourceAvailable={!!source?.ok}
        fixture={(process.env.RECEPTIONIST_MODE ?? "fixture") === "fixture"}
        semanticAvailable={!!process.env.AI_PROVIDER_KEY}
      />
    </>
  );
}
