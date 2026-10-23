import { handleVoiceWebhook } from "../../../../src/voice/webhook";
export async function POST(request: Request) {
  return handleVoiceWebhook(request, "turn");
}
