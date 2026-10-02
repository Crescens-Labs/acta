// Runs the golden cases for Acta's Langflow flows against a live Langflow server and checks every output.
// Usage: node langflow/eval/run.mjs [analyze|reply|screen]   (default: all)
// Reads LANGFLOW_URL, LANGFLOW_API_KEY, LANGFLOW_ANALYZE_FLOW_ID, LANGFLOW_REPLY_FLOW_ID, LANGFLOW_SCREEN_FLOW_ID from .env.
// Optional EVAL_MODEL (e.g. openai/gpt-oss-20b) overrides the analyze and reply models, to save the demo model's Groq quota.
import { readFileSync } from "node:fs";

try { process.loadEnvFile(new URL("../../.env", import.meta.url)); } catch { /* fall back to the real environment */ }
const { LANGFLOW_URL = "http://localhost:7860", LANGFLOW_API_KEY, LANGFLOW_ANALYZE_FLOW_ID, LANGFLOW_REPLY_FLOW_ID, LANGFLOW_SCREEN_FLOW_ID, EVAL_MODEL } = process.env;
if (!LANGFLOW_API_KEY || !LANGFLOW_ANALYZE_FLOW_ID || !LANGFLOW_REPLY_FLOW_ID || !LANGFLOW_SCREEN_FLOW_ID) {
  console.error("Set LANGFLOW_API_KEY, LANGFLOW_ANALYZE_FLOW_ID, LANGFLOW_REPLY_FLOW_ID and LANGFLOW_SCREEN_FLOW_ID in .env");
  process.exit(2);
}
// draft_reply takes the conversation through this Prompt Template field; the chat input is the latest message.
const REPLY_PROMPT_COMPONENT = "Prompt Template-5UrWt";

const ENUMS = {
  language: ["id", "en", "mixed"],
  intent: ["pricing_inquiry", "booking_request", "product_question", "complaint", "follow_up", "other"],
  urgency: ["low", "medium", "high"],
  sentiment: ["positive", "neutral", "negative"],
};
const SIGNALS = ["pricing_interest", "booking_request", "timeline_stated", "budget_stated", "quantity_stated",
  "competitor_comparison", "purchase_intent", "repeat_engagement", "complaint", "churn_risk", "low_intent",
  "prompt_injection_attempt"];
const REQUIRED_PARAMS = {
  schedule_appointment: ["service", "preferred_date", "preferred_time"],
  create_lead: ["customer_name", "product_interest"],
  create_ticket: ["issue_summary"],
  request_information: ["question"],
  follow_up: ["reason", "suggested_timing"],
  none: [],
};

// Contract checks that must hold for every output, regardless of the case.
export function contractErrors(out, input) {
  const errors = [];
  for (const [field, allowed] of Object.entries(ENUMS)) {
    if (!allowed.includes(out[field])) errors.push(`${field}=${JSON.stringify(out[field])} not allowed`);
  }
  if (typeof out.summary !== "string" || !out.summary) errors.push("summary missing");
  if (typeof out.confidence !== "number" || out.confidence < 0 || out.confidence > 1) errors.push("confidence out of range");
  if (typeof out.needs_review !== "boolean") errors.push("needs_review not boolean");
  if (out.confidence < 0.6 && out.needs_review === false) errors.push("confidence < 0.6 but needs_review is false");

  const customerText = new Map(input.messages.filter((m) => m.sender === "customer").map((m) => [m.id, m.text]));
  for (const s of out.signals ?? []) {
    if (!SIGNALS.includes(s.type)) errors.push(`unknown signal ${s.type}`);
    if (!fold(customerText.get(s.message_id) ?? "").includes(fold(s.evidence ?? ""))) errors.push(`evidence for ${s.type} is not a verbatim quote of customer message ${s.message_id}`);
  }
  if ((out.signals ?? []).some((s) => s.type === "prompt_injection_attempt") && !out.needs_review) {
    errors.push("prompt injection signal but needs_review is false");
  }

  const action = out.next_best_action ?? {};
  const required = REQUIRED_PARAMS[action.type];
  if (!required) errors.push(`unknown action ${action.type}`);
  else {
    for (const key of Object.keys(action.parameters ?? {})) if (!required.includes(key)) errors.push(`unexpected parameter ${key}`);
    for (const key of action.missing_parameters ?? []) if (!required.includes(key)) errors.push(`unexpected missing parameter ${key}`);
    for (const key of required) {
      if (!(key in (action.parameters ?? {})) && !(action.missing_parameters ?? []).includes(key)) errors.push(`required parameter ${key} neither filled nor listed missing`);
    }
  }
  return errors;
}

function expectationErrors(out, expect) {
  const errors = [];
  if (expect.intent && !expect.intent.includes(out.intent)) errors.push(`intent ${out.intent}, expected ${expect.intent}`);
  if (expect.action && !expect.action.includes(out.next_best_action?.type)) errors.push(`action ${out.next_best_action?.type}, expected ${expect.action}`);
  if ("needs_review" in expect && out.needs_review !== expect.needs_review) errors.push(`needs_review ${out.needs_review}, expected ${expect.needs_review}`);
  if (expect.sentiment && out.sentiment !== expect.sentiment) errors.push(`sentiment ${out.sentiment}, expected ${expect.sentiment}`);
  const types = (out.signals ?? []).map((s) => s.type);
  for (const t of expect.signals ?? []) if (!types.includes(t)) errors.push(`missing signal ${t}`);
  for (const [k, v] of Object.entries(expect.parameters ?? {})) {
    if (out.next_best_action?.parameters?.[k] !== v) errors.push(`parameter ${k}=${JSON.stringify(out.next_best_action?.parameters?.[k])}, expected ${v}`);
  }
  return errors;
}

// The model cannot be trusted with weekday arithmetic, so every request carries the next 14 days with their names.
// The backend must build the same calendar.
const DAYS = ["Sunday / Minggu", "Monday / Senin", "Tuesday / Selasa", "Wednesday / Rabu", "Thursday / Kamis", "Friday / Jumat", "Saturday / Sabtu"];
export function withCalendar(input) {
  const start = new Date(`${input.now.slice(0, 10)}T00:00:00Z`);
  const calendar = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86_400_000);
    return { date: d.toISOString().slice(0, 10), day: DAYS[d.getUTCDay()] };
  });
  const { now, ...rest } = input;
  return { now, calendar, ...rest };
}

async function runFlow(flowId, inputValue, tweaks = {}, modelComponent) {
  const override = EVAL_MODEL && modelComponent;
  if (override) tweaks = { ...tweaks, [modelComponent]: { model_name: EVAL_MODEL } };
  const res = await fetch(`${LANGFLOW_URL}/api/v1/run/${flowId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": LANGFLOW_API_KEY },
    body: JSON.stringify({ input_value: inputValue, input_type: "chat", output_type: "chat", tweaks }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const message = (await res.json()).outputs[0].outputs[0].results.message;
  const usedModel = message.properties?.source?.source;
  if (override && usedModel !== EVAL_MODEL) throw new Error(`EVAL_MODEL ignored: flow ran ${usedModel}`);
  return JSON.parse(message.text);
}

// Whitespace and bullet markers differ between the PDF chunks and the plain-text twin, so compare normalized text.
// NFKC plus dash folding: the model often writes Unicode hyphens and narrow no-break spaces.
const fold = (t) => t.normalize("NFKC").replace(/[\u2010-\u2015\u2212]/g, "-");
const normalize = (t) => fold(t).replace(/(^|\s)- /g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const knowledge = normalize(readFileSync(new URL("../fixtures/knowledge/aksara-academy-knowledge-base.txt", import.meta.url), "utf8"));

function replyErrors(out, expect) {
  const errors = [];
  if (typeof out.reply !== "string" || !out.reply.trim()) errors.push("reply missing");
  if (!Array.isArray(out.sources) || out.sources.length > 3) errors.push("sources must be a list of at most 3");
  if (!Array.isArray(out.unanswered)) errors.push("unanswered must be a list");
  if (typeof out.needs_review !== "boolean") errors.push("needs_review not boolean");
  // A source may join several knowledge lines; every line must still be a verbatim quote so the agent can verify it.
  for (const src of out.sources ?? []) {
    const lines = fold(src).split(/\n|\s-\s/).map(normalize).filter(Boolean);
    if (!lines.length || !lines.every((l) => knowledge.includes(l))) errors.push(`source is not a quote from the knowledge base: ${src}`);
  }
  if (out.unanswered?.length && !out.needs_review) errors.push("unanswered questions but needs_review is false");

  const reply = (out.reply ?? "").toLowerCase();
  if ("needs_review" in expect && out.needs_review !== expect.needs_review) errors.push(`needs_review ${out.needs_review}, expected ${expect.needs_review}`);
  for (const t of expect.include_all ?? []) if (!reply.includes(t.toLowerCase())) errors.push(`reply lacks "${t}"`);
  if (expect.include_any && !expect.include_any.some((t) => reply.includes(t.toLowerCase()))) errors.push(`reply lacks any of ${JSON.stringify(expect.include_any)}`);
  for (const t of expect.exclude ?? []) if (reply.includes(t.toLowerCase())) errors.push(`reply must not contain "${t}"`);
  if ((out.sources?.length ?? 0) < (expect.min_sources ?? 0)) errors.push(`expected at least ${expect.min_sources} source(s)`);
  if ((out.unanswered?.length ?? 0) < (expect.min_unanswered ?? 0)) errors.push(`expected at least ${expect.min_unanswered} unanswered item(s)`);
  return errors;
}

const suites = {
  analyze: {
    file: "./analyze_conversation.cases.json",
    run: (c) => runFlow(LANGFLOW_ANALYZE_FLOW_ID, JSON.stringify(withCalendar(c.input)), {}, "LanguageModelComponent-GXJb1"),
    check: (out, c) => [...contractErrors(out, c.input), ...expectationErrors(out, c.expect)],
  },
  reply: {
    file: "./draft_reply.cases.json",
    run: (c) => runFlow(LANGFLOW_REPLY_FLOW_ID, c.latest_message,
      { [REPLY_PROMPT_COMPONENT]: { conversation: JSON.stringify(c.conversation ?? { messages: [] }) } }, "LanguageModelComponent-LJv3n"),
    check: (out, c) => replyErrors(out, c.expect),
  },
  screen: {
    file: "./screen_message.cases.json",
    // Always the prompt-guard model: EVAL_MODEL does not apply here.
    run: (c) => runFlow(LANGFLOW_SCREEN_FLOW_ID, c.message),
    check: (score, c) => {
      if (typeof score !== "number" || score < 0 || score > 1) return [`score ${JSON.stringify(score)} is not a probability`];
      if (c.expect.max_score !== undefined && score > c.expect.max_score) return [`score ${score.toFixed(3)} above ${c.expect.max_score}`];
      if (c.expect.min_score !== undefined && score < c.expect.min_score) return [`score ${score.toFixed(3)} below ${c.expect.min_score}`];
      return [];
    },
  },
};

const selected = process.argv[2] ? [process.argv[2]] : Object.keys(suites);
let total = 0, failed = 0;
for (const name of selected) {
  const suite = suites[name];
  if (!suite) { console.error(`Unknown suite ${name}; use ${Object.keys(suites).join(" or ")}`); process.exit(2); }
  console.log(`\n== ${name}`);
  for (const c of JSON.parse(readFileSync(new URL(suite.file, import.meta.url), "utf8"))) {
    const started = Date.now();
    let errors;
    try { errors = suite.check(await suite.run(c), c); } catch (e) { errors = [`run failed: ${e.message}`]; }
    total++; if (errors.length) failed++;
    console.log(`${errors.length ? "FAIL" : "PASS"}  ${c.name}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    for (const e of errors) console.log(`      - ${e}`);
  }
}
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
