import type { State, Actor } from "./engine";
import type { RepairService } from "../contracts/repair";
import type {
  CustomAnswer,
  KnowledgeSnapshot,
  AnswerMatcher,
} from "../knowledge/types";
export type StoreGuide = {
  id: string;
  name: string;
  address: string;
  landmarks: string;
  sourceLocationId?: string;
};
export type DialogueMemory = {
  device?: string;
  model?: string;
  issue?: string;
  storeId?: string;
  offeredBooking?: boolean;
  detailsKnown?: boolean;
  choosingStore?: boolean;
  asked?: "device" | "model" | "details";
  history?: { role: "user" | "assistant"; text: string }[];
};
export type DialoguePlan = {
  action:
    | "ask_device"
    | "ask_model"
    | "ask_details"
    | "answer"
    | "offer_booking"
    | "booking"
    | "pricing"
    | "directions"
    | "hours"
    | "ticket"
    | "callback"
    | "other";
  device: string | null;
  model: string | null;
  issue: string | null;
  answerIds: string[];
  question: string | null;
  ack: "understood" | "thanks" | "sympathy" | "none";
};
export type DialoguePlanner = (input: {
  text: string;
  memory: DialogueMemory;
  answers: CustomAnswer[];
}) => Promise<DialoguePlan | null>;
export type AssistantState = State & { assistant?: DialogueMemory };
export type AssistantTurn = { text: string; state: AssistantState };
export type AssistantOptions = {
  service: RepairService;
  mode: "fixture" | "connected";
  knowledge: KnowledgeSnapshot;
  stores: StoreGuide[];
  planner?: DialoguePlanner;
  answerMatcher?: AnswerMatcher;
  onPending?: (state: State) => Promise<void>;
};
export type AssistantActor = Actor;
