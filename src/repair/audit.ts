import type { RepairService, Result } from "../contracts/repair";
import { recordOutcome } from "../persistence/conversations";
export function withAudit(
  service: RepairService,
  conversationId: string,
): RepairService {
  async function execute<T>(
    operationId: string,
    kind: string,
    work: () => Promise<Result<T>>,
  ): Promise<Result<T>> {
    await recordOutcome(conversationId, operationId, {
      kind,
      state: "pending",
    });
    try {
      const result = await work();
      await recordOutcome(conversationId, operationId, {
        kind,
        state: result.ok
          ? "succeeded"
          : result.code === "UNCERTAIN"
            ? "pending"
            : "failed",
        result,
      });
      return result;
    } catch {
      const result = {
        ok: false as const,
        code: "UNCERTAIN" as const,
        operationId,
      };
      await recordOutcome(conversationId, operationId, {
        kind,
        state: "pending",
        result,
      });
      return result;
    }
  }
  return {
    business: () => service.business(),
    slots: (...a) => service.slots(...a),
    beginVerification: (...a) => service.beginVerification(...a),
    verify: (...a) => service.verify(...a),
    ticket: (...a) => service.ticket(...a),
    operation: (...a) => service.operation(...a),
    book: (input, context) =>
      execute(context.operationId, "BOOKING", () =>
        service.book(input, context),
      ),
    changeStatus: (input, grant, context) =>
      execute(context.operationId, "STATUS_CHANGE", () =>
        service.changeStatus(input, grant, context),
      ),
  };
}
