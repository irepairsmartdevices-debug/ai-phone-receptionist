import { z } from "zod";
export const ProposalSchema = z.object({
  intent: z.enum([
    "business",
    "hours",
    "ticket",
    "booking",
    "staff_change",
    "other",
  ]),
});
export type Proposal = z.infer<typeof ProposalSchema>;
export function parseProposal(value: unknown): Proposal {
  return ProposalSchema.parse(value);
}
export interface ModelProvider {
  proposeTurn(text: string): Promise<Proposal>;
}
