#!/usr/bin/env node
/**
 * backfill_relevance.mjs — tag every existing jp_postings row with the strict
 * filter verdict (is_relevant + matched_keywords), so the dashboard can report a
 * meaningful number instead of "11,000+ jobs available".
 *
 * The rules below mirror src/lib/ingestion/filter.ts. If you change one, change both.
 *
 * Usage:
 *   node scripts/backfill_relevance.mjs --dry-run   # report only, no writes
 *   node scripts/backfill_relevance.mjs             # write the flags
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(APP_DIR, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error("missing supabase url/key in .env.local");
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// ---- rules mirroring src/lib/ingestion/filter.ts -------------------------

const KEYWORDS = [
  "full-stack", "full stack", "fullstack", "full-stack developer",
  "software engineer", "software developer", "backend engineer", "frontend engineer",
  "data engineer", "platform engineer", "machine learning",
  "AI engineer", "applied AI", "GenAI", "generative AI", "AI/ML",
  "machine learning engineer", "ML engineer", "LLM engineer",
  "staff engineer", "founding engineer", "technical lead",
  "RAG", "LLM", "LLMOps", "agentic", "multi-agent", "AI agent",
  "agent orchestration", "tool calling", "MCP",
  "LangChain", "LangGraph", "LlamaIndex", "CrewAI",
  "vector database", "vector db", "vector store", "vector search",
  "embeddings", "semantic search", "reranking", "pgvector",
  "Pinecone", "Weaviate", "Chroma",
  "TypeScript", "React", "Next.js", "Node.js", "Python", "FastAPI",
  "GraphQL", "PostgreSQL", "Kafka", "Docker", "Kubernetes", "AWS",
  "GCP", "Azure", "Supabase",
];

const VARIANTS = {
  "full-stack": ["full-stack", "full stack", "fullstack"],
  "full stack": ["full stack", "full-stack", "fullstack"],
  fullstack: ["fullstack", "full-stack", "full stack"],
  "multi-agent": ["multi-agent", "multi agent", "multiagent"],
  "Next.js": ["next.js", "nextjs", "next js"],
  "Node.js": ["node.js", "nodejs", "node js"],
  "vector database": ["vector database", "vector db", "vector store", "vector search"],
  "AI engineer": ["ai engineer", "applied ai engineer", "genai engineer"],
  LLM: ["llm", "llms", "large language model"],
  RAG: ["rag", "retrieval-augmented", "retrieval augmented"],
  "AI/ML": ["ai/ml", "ai ml"],
};

const EXCLUDE_TITLE = [
  "junior", "intern", "internship", "entry level", "entry-level", "unpaid",
  "new grad", "graduate program", "co-op", "apprentice", "student",
  "sales", "account executive", "business development", "recruiter", "talent",
  "marketing", "customer success", "solutions architect", "sales engineer",
  "product manager", "program manager", "project manager", "designer",
  "qa", "sdet", "technical writer", "finance", "accounting", "legal",
  "director", "vp", "head of", "contract", "contractor", "part-time",
];

const EXCLUDE_BODY = [
  "must be a us citizen",
  "us citizenship required",
  "security clearance",
  "ts/sci",
  "must reside in the united states",
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCHERS = KEYWORDS.map((kw) => {
  const forms = VARIANTS[kw] ?? [kw];
  const pattern = forms.map(esc).map((f) => f.replace(/\s+/g, "[\\s\\-]+")).join("|");
  return { kw, re: new RegExp(`\\b(?:${pattern})\\b`, "i") };
});

const TITLE_EXCLUDE_RE = new RegExp(`\\b(?:${EXCLUDE_TITLE.map(esc).join("|")})\\b`, "i");
const ENGINEERING_TITLE = /(engineer|engineering|developer|programmer|architect|scientist|researcher|sde|devops|sre|technical lead|tech lead|cto|founding)/i;
// jobPilot is the AI / full-stack specialist tracker (careerhub is the broader net).
// The title has to name that specialism, which is what keeps this list at ~50-100.
const SPECIALISM_TITLE = /(full[\s-]?stack|\bai\b|artificial intelligence|machine learning|\bml\b|\bllm\b|\brag\b|agentic|multi[\s-]?agent|genai|generative|langchain|langgraph|llamaindex|crewai|vector|retrieval|embedding|\bmcp\b|llmops|agent)/i;
const SENIOR_TITLE = /(senior|sr\.?|staff|principal|lead|architect|founding|expert|distinguished|fellow)/i;
const STRONG_AI_TITLE = /(ai|artificial intelligence|machine learning|ml|llm|rag|agentic|genai|generative|langchain|llamaindex|vector|retrieval|multi-agent)/i;
const CANADA_RE = /(canada|canadian|british columbia|ontario|quebec|alberta|manitoba|saskatchewan|nova scotia|toronto|vancouver|surrey|burnaby|richmond|coquitlam|langley|victoria|kelowna|montreal|montréal|ottawa|calgary|edmonton|waterloo|kitchener|winnipeg|halifax)/i;
const BLOCK_REGION = /(united states|u\.s\.|usa|us only|us-only|us remote|remote \(us\)|remote - us|new york|san francisco|seattle|austin|boston|chicago|denver|atlanta|dallas|los angeles|washington|california|texas|illinois|massachusetts|colorado|oregon|arizona|utah|virginia|florida|georgia|ohio|michigan|pennsylvania|europe|emea|germany|berlin|netherlands|amsterdam|utrecht|france|paris|spain|madrid|portugal|lisbon|united kingdom|england|london|ireland|dublin|poland|warsaw|sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|italy|milan|switzerland|zurich|austria|vienna|belgium|brussels|india|bangalore|hyderabad|singapore|japan|tokyo|australia|sydney|melbourne|brazil|sao paulo|mexico|latam|latin america|south america|argentina|colombia|chile|peru|uruguay|apac|asia|africa|dubai|abu dhabi|uae|united arab emirates|israel|tel aviv)/i;
const BARE_US = /(?:^|[\s,(])us(?:[\s,)]|$)/i;
const GLOBAL_REMOTE = /(anywhere|worldwide|work from anywhere|fully remote|100% remote|namer|north america|americas|global)/i;
const PLAIN_REMOTE = /(^|[\s(])remote([\s)]|$)/i;

function isEligibleLocation(location) {
  const loc = String(location ?? "").trim();
  if (!loc) return true;
  if (CANADA_RE.test(loc)) return true;
  if (BLOCK_REGION.test(loc) || BARE_US.test(loc)) return false;
  if (GLOBAL_REMOTE.test(loc)) return true;
  if (PLAIN_REMOTE.test(loc)) {
    const remainder = loc
      .replace(/\b(remote|fully|100%|work from home|wfh|hybrid)\b/gi, " ")
      .replace(/[(),;|+/\\-]+/g, " ")
      .trim();
    return remainder.length === 0;
  }
  return false;
}

function evaluate(posting) {
  const title = posting.title ?? "";
  const body = String(posting.description_raw ?? "");
  if (TITLE_EXCLUDE_RE.test(title)) return { ok: false, reason: "title-excluded" };
  if (!ENGINEERING_TITLE.test(title)) return { ok: false, reason: "not-engineering" };
  if (!SPECIALISM_TITLE.test(title)) return { ok: false, reason: "not-ai-or-fullstack" };
  const bodyLower = body.toLowerCase();
  if (EXCLUDE_BODY.some((p) => bodyLower.includes(p))) return { ok: false, reason: "body-excluded" };
  if (!isEligibleLocation(posting.location)) return { ok: false, reason: "region-restricted" };
  const titleHits = MATCHERS.filter((m) => m.re.test(title)).map((m) => m.kw);
  if (titleHits.length === 0) return { ok: false, reason: "no-title-keyword" };
  if (!SENIOR_TITLE.test(title) && !STRONG_AI_TITLE.test(title)) return { ok: false, reason: "not-senior" };
  return { ok: true, matched: [...new Set(titleHits)] };
}

// ------------------------------------------------------------------ run

async function page(offset, limit = 500) {
  const r = await fetch(
    `${URL_BASE}/rest/v1/jp_postings?select=id,ats_source,title,location,description_raw&order=id&limit=${limit}&offset=${offset}`,
    { headers: H }
  );
  if (!r.ok) throw new Error(`page ${offset}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function patchChunk(ids, isRelevant, matched) {
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const r = await fetch(`${URL_BASE}/rest/v1/jp_postings?id=in.(${chunk.join(",")})`, {
      method: "PATCH",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({
        is_relevant: isRelevant,
        matched_keywords: isRelevant ? matched : [],
      }),
    });
    if (!r.ok) throw new Error(`patch: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
}

const stats = { scanned: 0, keep: 0, drop: 0 };
const byChannel = {};
const byReason = {};
let offset = 0;

while (true) {
  const rows = await page(offset);
  if (rows.length === 0) break;
  offset += rows.length;
  stats.scanned += rows.length;

  const keep = [];
  const drop = [];
  for (const row of rows) {
    const verdict = evaluate(row);
    byChannel[row.ats_source] ??= { keep: 0, drop: 0 };
    if (verdict.ok) {
      stats.keep += 1;
      byChannel[row.ats_source].keep += 1;
      keep.push(row.id);
    } else {
      stats.drop += 1;
      byChannel[row.ats_source].drop += 1;
      byReason[verdict.reason] = (byReason[verdict.reason] ?? 0) + 1;
      drop.push(row.id);
    }
  }

  if (!DRY_RUN) {
    if (keep.length) await patchChunk(keep, true, []); // matched list not needed for counts
    if (drop.length) await patchChunk(drop, false, []);
    console.log(`  processed ${stats.scanned} rows…`);
  }
}

console.log(`\nscanned ${stats.scanned}  keep ${stats.keep}  drop ${stats.drop}${DRY_RUN ? "  (dry run)" : ""}`);
for (const [ch, v] of Object.entries(byChannel)) {
  console.log(`  ${ch.padEnd(12)} keep=${v.keep} drop=${v.drop}`);
}
console.log("drop reasons:", JSON.stringify(byReason, null, 0));
