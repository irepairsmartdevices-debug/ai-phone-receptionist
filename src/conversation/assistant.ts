import { ConversationEngine, type Actor } from "./engine";
import type { Proposal } from "../providers/model";
import { redact } from "../persistence/conversations";
import {
  matchSavedAnswer,
  normalize,
  isPriceQuestion,
  quoteCatalog,
} from "../knowledge/resolve";
import { resolveStores, renderDirections } from "./directions";
import type {
  AssistantOptions,
  AssistantState,
  AssistantTurn,
  DialogueMemory,
  DialoguePlan,
  StoreGuide,
  DialogueCatalogItem,
} from "./assistant-types";

import { nextQuestion } from "./dialogue-questions";
import {
  boundedDetails,
  catalogModel,
  correcting,
  exactModelIn,
  grounded,
  observations,
} from "./dialogue-grounding";

const bound = (value: string | undefined, max: number) =>
  value ? redact(value).slice(0, max) : undefined;
function memoryFrom(value: DialogueMemory | undefined): DialogueMemory {
  if (!value) return {};
  return {
    ...value,
    device: bound(value.device, 120),
    model: bound(value.model, 120),
    issue: bound(value.issue, 1000),
    details: boundedDetails(value.details),
    history: (value.history ?? []).slice(-8).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: redact(String(m.text)).slice(0, 600),
    })),
  };
}
const no = (text: string) =>
  /^(?:no\b|not now\b|later[.! ]*$)|\b(?:dont|don't|do not|not want to)\b.*\b(?:book|appointment)\b/i.test(
    text.trim(),
  );
const yes = (text: string) =>
  /^(?:yes|yes please|sure|okay|ok|please do|book it)[.! ]*$/i.test(
    text.trim(),
  );
const directionRequest = (text: string) =>
  /\b(address|directions?|located|landmark|redbird|hair depot)\b/i.test(text) ||
  /\bwhere\b.*\b(store|shop|location|you|dallas)\b/i.test(text) ||
  /\bhow\b.*\b(get|reach|find)\b.*\b(you|store|shop|there)\b/i.test(text);
const guarded = (text: string) =>
  /\b(ticket|status|repair ready|cancel|change status|mark .*complete|admin|ignore .*rules|book|appointment|schedule)\b/i.test(
    text,
  );
const report = (text: string) =>
  !/^(?:do|does|can|could|will|would|are|is|what|how|why|when|where)\b/i.test(
    text.trim(),
  ) &&
  /\b(wet|water|liquid|took a swim|soaked|spilled|broken|cracked|not charging|wont turn on|won't turn on|screen is|screen went|battery is)\b/i.test(
    text,
  );
function explicitModel(text: string) {
  const match = text.match(
    /\b(iPhone\s*\d{1,3}(?:\s*(?:Pro|Max|Plus|Mini|Ultra|XL|5G|4G|LTE|Wi-Fi))*|iPad\s+(?:Pro|Air|Mini)?\s*\d{1,3}(?:\s*(?:Pro|Air|Mini))?|(?:Samsung\s+)?Galaxy\s+[A-Z]?\d{1,3}(?:\s*(?:Ultra|Plus|FE|Pro|Max|XL|5G|4G|LTE|Wi-Fi))*|Pixel\s*\d{1,3}(?:\s*(?:Pro|XL|Max|Plus|Ultra|5G|4G|LTE|Wi-Fi))*)\b/i,
  );
  return match?.[0];
}
function deviceClass(text: string) {
  return /ipad|tablet/i.test(text)
    ? "tablet"
    : /laptop|macbook/i.test(text)
      ? "laptop"
      : /iphone|galaxy|pixel|samsung|android|phone/i.test(text)
        ? "phone"
        : /computer|desktop|pc/i.test(text)
          ? "computer"
          : "";
}
function waterIssue(text: string) {
  const positive = normalize(text).replace(
    /\b(?:did not|didnt|does not|doesnt|not|never|no)(?: get| got| getting| have| has| any)? (?:wet|water damage|liquid damage)\b/g,
    "",
  );
  return /\b(wet|water|liquid|swim|soaked|spilled)\b/.test(positive);
}
function specificSymptoms(text: string) {
  return /\b((?:screen|display) (?:is |went )?(?:black|cracked|blank)|(?:will not|wont|cannot|cant|does not|doesnt) (?:turn on|charge|power on)|not charging|no (?:display|sound)|battery (?:is )?swollen)\b/.test(
    normalize(text),
  );
}
function extract(text: string, memory: DialogueMemory): DialogueMemory {
  const m = { ...memory };
  const model = explicitModel(text);
  if (model) {
    m.model = redact(model).slice(0, 120);
    m.device = /iphone/i.test(model)
      ? "iPhone"
      : /ipad/i.test(model)
        ? "iPad"
        : /galaxy/i.test(model)
          ? "Galaxy"
          : "Pixel";
  } else if (
    m.asked === "device" &&
    text.length <= 120 &&
    !/[?]/.test(text) &&
    !guarded(text)
  ) {
    m.device = bound(text.trim().replace(/^(?:it'?s|it is|a|an)\s+/i, ""), 120);
  } else if (
    m.asked === "model" &&
    text.length <= 120 &&
    !/[?]/.test(text) &&
    !guarded(text)
  ) {
    m.model = bound(text.trim(), 120);
  }
  const d = text.match(
    /\b(iPhone|iPad|Samsung|Galaxy|Android|Pixel|phone|tablet|laptop|MacBook|computer|watch|console)\b/i,
  );
  if (d && !model) {
    const changedClass =
      m.device && deviceClass(m.device) !== deviceClass(d[0]);
    const correction = /\b(actually|instead|correction|rather)\b/i.test(text);
    const explicitBrand = /^(iPhone|iPad|Samsung|Galaxy|Pixel|MacBook)$/i.test(
      d[0],
    );
    const changedBrand =
      correction &&
      explicitBrand &&
      m.device &&
      normalize(m.device) !== normalize(d[0]);
    if (changedClass || changedBrand) {
      m.device = d[0];
      m.model = undefined;
      m.detailsKnown = false;
    } else if (!m.device) m.device = d[0];
  }
  const issueCorrection =
    /\b(actually|instead|correction|rather)\b/i.test(text) && report(text);
  if (issueCorrection) {
    m.issue = bound(text, 1000);
    m.detailsKnown = specificSymptoms(text);
  } else if (report(text) && !m.issue) m.issue = bound(text, 1000);
  if (specificSymptoms(text)) m.detailsKnown = true;
  if (m.asked === "details" && !model && text.trim() && !guarded(text)) {
    if (!issueCorrection)
      m.issue = bound([m.issue, text.trim()].filter(Boolean).join("; "), 1000);
    m.detailsKnown = specificSymptoms(text);
    m.asked = undefined;
  }
  return m;
}
function traceable(
  value: string | null,
  text: string,
  memory: DialogueMemory,
  max: number,
) {
  if (!value) return undefined;
  const candidate = redact(value).slice(0, max);
  const haystack = [
    text,
    ...(memory.history ?? [])
      .filter((m) => m.role === "user")
      .map((m) => m.text),
    memory.device ?? "",
    memory.model ?? "",
    memory.issue ?? "",
  ]
    .map(normalize)
    .join(" ");
  return normalize(candidate) &&
    ` ${haystack} `.includes(` ${normalize(candidate)} `)
    ? candidate
    : undefined;
}
function currentPolicy(
  options: AssistantOptions,
  memory: DialogueMemory,
  plan: DialoguePlan | null,
) {
  const eligible = options.knowledge.answers.filter((a) => {
    if (
      /\b(warranty|guarantee|refund|price|cost|hours|how long|turnaround|data|photos|password)\b/i.test(
        a.question,
      )
    )
      return false;
    const qClass = deviceClass(a.question),
      currentClass = deviceClass(
        [memory.device, memory.model].filter(Boolean).join(" "),
      );
    if (qClass && currentClass && qClass !== currentClass) return false;
    const qModel = explicitModel(a.question);
    const currentModel =
      explicitModel(memory.model ?? "") ??
      [memory.device, memory.model].filter(Boolean).join(" ");
    if (
      qModel &&
      normalize(qModel).replace(/ /g, "") !==
        normalize(currentModel).replace(/ /g, "")
    )
      return false;
    const qWater = /\b(wet|water|liquid)\b/i.test(a.question);
    if (qWater && !waterIssue(memory.issue ?? "")) return false;
    return true;
  });
  const chosen = (plan?.answerIds ?? [])
    .map((id) => eligible.find((a) => a.id === id))
    .filter(Boolean);
  if (chosen.length) return chosen.map((a) => a!.answer).join(" ");
  const match = matchSavedAnswer(memory.issue ?? "", eligible);
  if (match.answer) return match.answer.answer;
  if (waterIssue(memory.issue ?? "")) {
    const capability = eligible.filter((a) =>
      /\b(repair|fix|inspect|assessment|assess)\b/i.test(a.question),
    );
    const category = /ipad|tablet/i.test(memory.device ?? "")
      ? "tablets"
      : /laptop|macbook/i.test(memory.device ?? "")
        ? "laptops"
        : "devices";
    const policy = matchSavedAnswer(
      "Do you repair water damage " + category + "?",
      capability,
    );
    if (policy.answer) return policy.answer.answer;
  }
  return "";
}
export async function runAssistantTurn(
  options: AssistantOptions,
  state: AssistantState,
  text: string,
  actor: Actor,
  conversationId: string,
  intentHint?: Proposal["intent"],
): Promise<AssistantTurn> {
  const value = text.trim().slice(0, 2000);
  let memory = memoryFrom(state.assistant);
  const engine = new ConversationEngine(
    options.service,
    options.mode,
    options.onPending,
    options.knowledge,
    options.answerMatcher,
  );
  const finish = (
    answer: string,
    next: AssistantState = state,
  ): AssistantTurn => {
    memory.history = [
      ...(memory.history ?? []),
      { role: "user", text: redact(value).slice(0, 600) },
      { role: "assistant", text: redact(answer).slice(0, 600) },
    ].slice(-8) as NonNullable<DialogueMemory["history"]>;
    return { text: answer, state: { ...next, assistant: memory } };
  };
  const delegate = async (input = value, hint = intentHint) => {
    const result = await engine.turn(state, input, actor, conversationId, hint);
    if (result.state.lastQuote) {
      memory.model = result.state.lastQuote.model;
      const confirmedModel = explicitModel(result.state.lastQuote.model);
      if (confirmedModel) memory = extract(confirmedModel, memory);
    }
    return finish(result.text, result.state);
  };
  if (/^(restart|start over)$/i.test(value))
    return engine.turn(state, value, actor, conversationId);
  const topicReply = (answer: string) => {
    // A new topic answers the caller's question instead of continuing an older
    // public store-choice prompt. Keep device and protected workflow context.
    memory.choosingStore = false;
    return finish(answer);
  };
  // Named topics are owner-written replies, including custom location wording.
  // Match them before built-in directions, but never consume a protected field,
  // a pricing question, personal repair intake, or acceptance of a booking offer.
  if (
    (!state.step || state.step === "start") &&
    !guarded(value) &&
    !isPriceQuestion(value) &&
    !report(value) &&
    !(memory.offeredBooking && (yes(value) || no(value)))
  ) {
    const saved = matchSavedAnswer(value, options.knowledge.answers);
    if (saved.ambiguous)
      return topicReply(
        "I found more than one saved answer that could fit. Could you clarify your question?",
      );
    if (saved.answer?.topic) return topicReply(saved.answer.answer);
    // Explicit location requests otherwise bypass FAQ matching. Give the AI a
    // chance to select an approved named topic, never to write its own address.
    if (
      !saved.answer &&
      directionRequest(value) &&
      options.answerMatcher &&
      options.knowledge.answers.some((a) => a.topic)
    ) {
      try {
        const id = await options.answerMatcher(
          redact(value),
          options.knowledge.answers,
        );
        const selected = options.knowledge.answers.find(
          (a) => a.id === id && a.topic,
        );
        if (selected) return topicReply(selected.answer);
      } catch {
        /* Current saved directions remain available when AI matching fails. */
      }
    }
  }
  // Directions are public and may interrupt intake without consuming a booking
  // confirmation or changing a verification step.
  if (memory.choosingStore && guarded(value) && !directionRequest(value))
    memory.choosingStore = false;
  const directions = async (): Promise<AssistantTurn> => {
    let locations: StoreGuide[] = options.stores;
    try {
      const b = await options.service.business();
      locations = resolveStores(
        b.ok ? b.value.locations : [],
        options.stores,
        options.mode,
      );
    } catch {
      locations = resolveStores([], options.stores, options.mode);
    }
    const namesStore = locations.some(
      (l) =>
        ` ${normalize(value)} `.includes(` ${normalize(l.name)} `) ||
        normalize(value) === normalize(l.id),
    );
    if (
      memory.choosingStore &&
      !directionRequest(value) &&
      !namesStore &&
      ((state.step && state.step !== "start") ||
        guarded(value) ||
        report(value))
    ) {
      memory.choosingStore = false;
      return runAssistantTurn(
        options,
        { ...state, assistant: memory },
        value,
        actor,
        conversationId,
        intentHint,
      );
    }
    if (!locations.length) {
      memory.choosingStore = false;
      return finish(
        "I don't have a confirmed store address. I can take a callback request so the shop can help with directions.",
      );
    }
    const containsName = (name: string) =>
      ` ${normalize(value)} `.includes(` ${normalize(name)} `);
    const mentions = locations.filter(
      (l) => containsName(l.name) || normalize(value) === normalize(l.id),
    );
    const mentioned = mentions.filter(
      (l) =>
        !mentions.some(
          (other) =>
            other !== l &&
            ` ${normalize(other.name)} `.includes(` ${normalize(l.name)} `),
        ),
    );
    let selected =
      mentioned.length === 1
        ? mentioned[0]
        : mentioned.length
          ? undefined
          : locations.find((l) => l.id === memory.storeId);
    if (!selected && !mentioned.length && locations.length === 1)
      selected = locations[0];
    if (!selected) {
      memory.choosingStore = true;
      return finish(
        "Which store would you like directions to? " +
          locations.map((l) => l.name).join(" or ") +
          "?",
      );
    }
    memory.choosingStore = false;
    memory.storeId = selected.id;
    return finish(renderDirections(selected));
  };
  if (directionRequest(value) || memory.choosingStore) return directions();
  // All active ticket, booking, confirmation and pricing states belong to the
  // existing deterministic authorization/transaction engine.
  if (state.step && state.step !== "start") return delegate();
  if (memory.offeredBooking && no(value)) {
    memory.offeredBooking = false;
    memory.asked = undefined;
    return finish(
      "No appointment has been booked. I can answer another question or help you leave a callback message.",
      { step: "start" },
    );
  }
  if (memory.offeredBooking && yes(value)) {
    memory.offeredBooking = false;
    memory.asked = undefined;
    return delegate("book appointment", "booking");
  }
  if (
    guarded(value) ||
    (intentHint && ["ticket", "booking", "staff_change"].includes(intentHint))
  ) {
    if (
      /\b(book|appointment|schedule)\b/i.test(value) ||
      intentHint === "booking"
    ) {
      memory.offeredBooking = false;
      memory.asked = undefined;
    }
    return delegate();
  }
  if (/\b(callback|call me|call back)\b/i.test(value)) {
    memory.offeredBooking = false;
    return finish(
      "Please use the callback form to leave your name, phone number and message so the shop can contact you.",
      { step: "start" },
    );
  }
  const previousMemory = { ...memory };
  const correction = correcting(value);
  const resetDevice =
    correction &&
    /\b(different|wrong|not the|not an?)\b.*\b(model|device|phone|tablet|laptop)\b/i.test(
      value,
    );
  if (resetDevice) {
    memory.model = undefined;
    memory.details = {};
    memory.detailsKnown = false;
    memory.offeredBooking = false;
    memory.asked = undefined;
  }
  if (correction && report(value)) {
    memory.details = {};
    memory.detailsKnown = false;
  }
  const currentModel = explicitModel(value);
  memory = extract(value, memory);
  memory.details = observations(value, memory);
  if (memory.details.symptoms) memory.detailsKnown = true;
  // Corrections invalidate an old estimate before any later booking or pricing turn.
  if (
    correction ||
    memory.model !== previousMemory.model ||
    memory.device !== previousMemory.device
  )
    state = { ...state, lastQuote: undefined, pricing: undefined };
  const priceInput = () => {
    const explicit =
      explicitModel(value) || /\b[a-z]*\d+[a-z0-9]*\b/i.test(value);
    const context = explicit ? "" : (memory.model ?? "");
    const repair =
      /\b(screen|display|glass|battery|camera|charging|port|water|liquid|speaker|repair|replacement)\b/i.test(
        value,
      )
        ? ""
        : memory.details?.symptoms || memory.issue || "";
    return ["price", value, context, repair].filter(Boolean).join(" ");
  };
  if (isPriceQuestion(value)) return delegate(priceInput());
  const personal = report(value) || !!memory.issue;
  const exact = matchSavedAnswer(value, options.knowledge.answers);
  if (exact.answer && !report(value)) return delegate();
  if (/^(?:what|when|are|is|how)\b.*\b(hours|open|close|closed)\b/i.test(value))
    return delegate(value, "hours");
  let plan: DialoguePlan | null = null;
  let catalog: DialogueCatalogItem[] = [];
  if (options.planner) {
    try {
      const business = await options.service.business();
      catalog = quoteCatalog(
        business.ok ? business.value : undefined,
        options.knowledge.prices,
      )
        .filter(
          (row) =>
            row.id.length <= 160 &&
            [row.category, row.brand, row.model, row.repair].every(
              (label) => label.length <= 120,
            ),
        )
        .slice(0, 200)
        .map(({ id, category, brand, model, repair }) => ({
          id,
          category,
          brand,
          model,
          repair,
        }));
    } catch {
      /* A failed catalog read does not block deterministic intake. */
    }
    try {
      plan =
        (await options.planner({
          text: redact(value),
          memory,
          answers: options.knowledge.answers,
          catalog,
        })) ?? null;
    } catch {
      /* deterministic intake remains available */
    }
  }
  const foundModel = catalogModel(value, catalog);
  if (foundModel) {
    memory.model = foundModel;
    const row = catalog.find((row) => row.model === foundModel)!;
    if (!memory.device) memory.device = row.brand || row.category || "device";
  }
  if (plan) {
    // During corrections, only this turn can supply replacements. History must
    // never resurrect a rejected model, issue, or observation.
    const evidence = correction
      ? {
          ...memory,
          history: [],
          model: undefined,
          device: undefined,
          issue: undefined,
        }
      : memory;
    const device = traceable(plan.device, value, evidence, 120),
      model = traceable(plan.model, value, evidence, 120),
      issue = traceable(plan.issue, value, evidence, 1000);
    if (device && !currentModel && memory.device === previousMemory.device) {
      if (memory.device && normalize(memory.device) !== normalize(device))
        memory.model = undefined;
      memory.device = device;
    }
    if (
      model &&
      !currentModel &&
      !foundModel &&
      (!memory.model || memory.model === previousMemory.model) &&
      (!grounded(model, value) || exactModelIn(value, model))
    )
      memory.model = model;
    if (issue && (!memory.issue || memory.issue === previousMemory.issue))
      memory.issue = issue;
    memory.details = observations(value, memory, plan.details);
    if (memory.details.symptoms) memory.detailsKnown = true;
  }
  if (
    memory.model !== previousMemory.model ||
    memory.device !== previousMemory.device
  )
    state = { ...state, lastQuote: undefined, pricing: undefined };
  if (plan?.action === "answer") {
    const selected = plan.answerIds.map((id) =>
      options.knowledge.answers.find((a) => a.id === id),
    );
    const topic = selected.find((a) => a?.topic);
    if (topic) return topicReply(topic.answer);
    if (!personal && selected.some(Boolean))
      return finish(
        selected
          .filter(Boolean)
          .map((a) => a!.answer)
          .join(" "),
        { step: "start" },
      );
  }
  if (plan?.action === "pricing") {
    // An ID is a reference only; never use it to supply an unmentioned model or
    // trust a provider amount. The quote engine rereads current source data.
    const selected = catalog.find((row) => row.id === plan.catalogOfferingId);
    const input = priceInput();
    const repairEvidence = [value, memory.issue, memory.details?.symptoms]
      .filter(Boolean)
      .join(" ");
    const compatible =
      selected &&
      normalize(selected.model) === normalize(memory.model ?? "") &&
      normalize(selected.repair)
        .split(" ")
        .some(
          (word) =>
            !["repair", "replacement", "service"].includes(word) &&
            word.length > 3 &&
            normalize(repairEvidence).split(" ").includes(word),
        );
    return delegate(compatible ? `${input} ${selected.repair}` : input);
  }
  if (plan?.action === "directions") return directions();
  if (plan?.action === "hours") return delegate("hours", "hours");
  if (
    plan?.action === "booking" &&
    /\b(reserve|arrange|schedule|book)\b.*\b(visit|appointment|time|slot)\b/i.test(
      value,
    )
  ) {
    memory.offeredBooking = false;
    memory.asked = undefined;
    return delegate(value, "booking");
  }
  const intake =
    personal ||
    !!memory.issue ||
    (plan &&
      ["ask_device", "ask_model", "ask_details", "offer_booking"].includes(
        plan.action,
      ));
  if (!intake) {
    if (plan?.action === "answer") {
      const facts = plan.answerIds
        .map((id) => options.knowledge.answers.find((a) => a.id === id)?.answer)
        .filter(Boolean);
      if (facts.length) return finish(facts.join(" "), { step: "start" });
    }
    if (plan?.action === "ticket") return delegate("ticket status", "ticket");
    if (plan?.action === "callback")
      return finish(
        "I can help you leave a callback message. Please use the callback form so the shop can contact you.",
        { step: "start" },
      );
    return delegate();
  }
  const question = nextQuestion(memory, plan);
  if (question.goal !== "offer_visit") {
    memory.askedGoal = question.goal;
    memory.asked =
      question.goal === "device" || question.goal === "model"
        ? question.goal
        : "details";
    memory.offeredBooking = false;
    return finish(question.text, { step: "start" });
  }
  memory.asked = undefined;
  memory.askedGoal = undefined;
  memory.offeredBooking = true;
  const policy = currentPolicy(options, memory, plan);
  return finish((policy ? policy + " " : "") + question.text, {
    step: "start",
  });
}
