import type {
  DialogueGoal,
  DialogueMemory,
  DialoguePlan,
  DialogueStyle,
} from "./assistant-types";

// These are observational questions only. All shop facts come from approved data.
const questions: Record<DialogueGoal, Record<DialogueStyle, string>> = {
  device: {
    direct: "What kind of device got wet or is having the problem?",
    warm: "Which device do you need help with?",
    contextual: "Which device was affected?",
  },
  model: {
    direct: "What is the exact model of your device?",
    warm: "Could you tell me the exact model?",
    contextual: "Which model is the affected device?",
  },
  symptoms: {
    direct: "What problems have you noticed since that happened?",
    warm: "What symptoms are you noticing now?",
    contextual: "What changes have you noticed with the device?",
  },
  liquid: {
    direct: "What liquid was involved?",
    warm: "What kind of liquid got on it?",
    contextual: "Which liquid was the device exposed to?",
  },
  occurredAt: {
    direct: "When did this happen?",
    warm: "About how long ago did that happen?",
    contextual: "When did you first notice the problem?",
  },
  power: {
    direct: "Is the device currently on or off?",
    warm: "Is it still powered on, or is it off?",
    contextual: "What is its current power state: on or off?",
  },
  offer_visit: {
    direct:
      "Would you like to book a repair visit, or would you prefer to leave a callback message for the shop?",
    warm: "Would you like help booking a repair visit, or leaving a callback message for the shop?",
    contextual: "Would you prefer a repair visit or a callback from the shop?",
  },
};
export function nextQuestion(
  memory: DialogueMemory,
  plan: DialoguePlan | null,
) {
  const missing = (goal: DialogueGoal) => {
    if (goal === "device") return !memory.device;
    if (goal === "model") return !memory.model;
    if (goal === "offer_visit") return !!memory.device && !!memory.model;
    if (goal === "symptoms")
      return !memory.details?.symptoms && !memory.detailsKnown;
    if (
      goal === "liquid" &&
      !/wet|water|liquid|swim|spill|soak|drench/i.test(memory.issue ?? "")
    )
      return false;
    return !memory.details?.[goal];
  };
  let goal: DialogueGoal;
  if (!memory.device) goal = "device";
  else if (!memory.model) goal = "model";
  else if (
    plan?.nextGoal &&
    Object.hasOwn(questions, plan.nextGoal) &&
    missing(plan.nextGoal)
  )
    goal = plan.nextGoal;
  else if (
    !missing("symptoms") ||
    memory.offeredBooking ||
    plan?.action === "offer_booking"
  )
    goal = "offer_visit";
  else goal = "symptoms";
  const style =
    plan?.style && Object.hasOwn(questions[goal], plan.style)
      ? plan.style
      : "direct";
  return { goal, text: questions[goal][style] };
}
