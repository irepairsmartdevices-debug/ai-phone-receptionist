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
export type DialogueGoal =
  | "device"
  | "model"
  | "symptoms"
  | "liquid"
  | "occurredAt"
  | "power"
  | "offer_visit";
export type DialogueStyle = "direct" | "warm" | "contextual";
export type DialogueDetails = {
  liquid?: string | null;
  occurredAt?: string | null;
  symptoms?: string | null;
  power?: string | null;
};
export type DialogueCatalogItem = {
  id: string;
  category: string;
  brand: string;
  model: string;
  repair: string;
};
export type DialogueMemory = {
  details?: DialogueDetails;
  askedGoal?: DialogueGoal;
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
  details?: DialogueDetails;
  nextGoal?: DialogueGoal | null;
  style?: DialogueStyle;
  catalogOfferingId?: string | null;
  reset?: "device" | "issue" | null;
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
  catalog?: DialogueCatalogItem[];
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
