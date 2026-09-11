/**
 * Strict relevance filter for jobPilot.
 *
 * jobPilot is the curated app: only postings that clear all four gates are stored
 * and counted. Target volume is 50-100 live postings, not thousands — an unfiltered
 * ATS board is 10,000+ rows of mostly sales/marketing noise.
 *
 * Gates (all must pass):
 *   1. title must not look like a non-engineering or junior role
 *   2. title must look like an engineering role
 *   3. a KEYWORD must appear in the TITLE (a keyword buried in the description is
 *      not enough — that alone accounts for ~90% of the noise)
 *   4. title must carry a seniority signal, unless it names an AI specialism
 *   5. location must be Canada-eligible or genuinely location-agnostic
 *
 * NOTE: scripts/backfill_relevance.mjs mirrors this logic for existing rows. If you
 * change the rules here, change them there too (and re-run the backfill).
 */

export const KEYWORDS = [
  // role titles
  "full-stack", "full stack", "fullstack", "full-stack developer",
  "software engineer", "software developer", "backend engineer", "frontend engineer",
  "data engineer", "platform engineer", "machine learning",
  "AI engineer", "applied AI", "GenAI", "generative AI", "AI/ML",
  "machine learning engineer", "ML engineer", "LLM engineer",
  "staff engineer", "founding engineer", "technical lead",
  // agentic
  "RAG", "LLM", "LLMOps", "agentic", "multi-agent", "AI agent",
  "agent orchestration", "tool calling", "MCP",
  "LangChain", "LangGraph", "LlamaIndex", "CrewAI",
  // retrieval
  "vector database", "vector db", "vector store", "vector search",
  "embeddings", "semantic search", "reranking", "pgvector",
  "Pinecone", "Weaviate", "Chroma",
  // stack
  "TypeScript", "React", "Next.js", "Node.js", "Python", "FastAPI",
  "GraphQL", "PostgreSQL", "Kafka", "Docker", "Kubernetes", "AWS",
  "GCP", "Azure", "Supabase",
];

/** Extra spellings per keyword — keeps word-boundary matching as permissive as substring matching. */
const VARIANTS: Record<string, string[]> = {
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

export const EXCLUDE_TITLE = [
  "junior", "intern", "internship", "entry level", "entry-level", "unpaid",
  "new grad", "graduate program", "co-op", "apprentice", "student",
  "sales", "account executive", "business development", "recruiter", "talent",
  "marketing", "customer success", "solutions architect", "sales engineer",
  "product manager", "program manager", "project manager", "designer",
  "qa", "sdet", "technical writer", "finance", "accounting", "legal",
  "director", "vp", "head of", "contract", "contractor", "part-time",
];

/** Only unambiguous, body-level disqualifiers. */
export const EXCLUDE_BODY = [
  "must be a us citizen",
  "us citizenship required",
  "security clearance",
  "ts/sci",
  "must reside in the united states",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const build = (keyword: string): RegExp => {
  const forms = VARIANTS[keyword] ?? [keyword];
  const pattern = forms.map(escapeRe).map((f) => f.replace(/\s+/g, "[\\s\\-]+")).join("|");
  // Word boundaries (not case sensitivity) are what stop "RAG" matching "storage".
  return new RegExp(`\\b(?:${pattern})\\b`, "i");
};

const MATCHERS = KEYWORDS.map((kw) => ({ kw, re: build(kw) }));
const TITLE_EXCLUDE_RE = new RegExp(`\\b(?:${EXCLUDE_TITLE.map(escapeRe).join("|")})\\b`, "i");

const ENGINEERING_TITLE =
  /(engineer|engineering|developer|programmer|architect|scientist|researcher|sde|devops|sre|technical lead|tech lead|cto|founding)/i;

// jobPilot is the AI / full-stack specialist tracker (careerhub is the broader net).
// The title has to name that specialism — this is what keeps the list at ~50-100.
const SPECIALISM_TITLE =
  /(full[\s-]?stack|\bai\b|artificial intelligence|machine learning|\bml\b|\bllm\b|\brag\b|agentic|multi[\s-]?agent|genai|generative|langchain|langgraph|llamaindex|crewai|vector|retrieval|embedding|\bmcp\b|llmops|agent)/i;

const SENIOR_TITLE =
  /(senior|sr\.?|staff|principal|lead|architect|founding|expert|distinguished|fellow)/i;

const STRONG_AI_TITLE =
  /(ai|artificial intelligence|machine learning|ml|llm|rag|agentic|genai|generative|langchain|llamaindex|vector|retrieval|multi-agent)/i;

const CANADA_RE =
  /(canada|canadian|british columbia|ontario|quebec|alberta|manitoba|saskatchewan|nova scotia|toronto|vancouver|surrey|burnaby|richmond|coquitlam|langley|victoria|kelowna|montreal|montréal|ottawa|calgary|edmonton|waterloo|kitchener|winnipeg|halifax)/i;

const BLOCK_REGION =
  /(united states|u\.s\.|usa|us only|us-only|us remote|remote \(us\)|remote - us|new york|san francisco|seattle|austin|boston|chicago|denver|atlanta|dallas|los angeles|washington|california|texas|illinois|massachusetts|colorado|oregon|arizona|utah|virginia|florida|georgia|ohio|michigan|pennsylvania|europe|emea|germany|berlin|netherlands|amsterdam|utrecht|france|paris|spain|madrid|portugal|lisbon|united kingdom|england|london|ireland|dublin|poland|warsaw|sweden|stockholm|denmark|copenhagen|norway|oslo|finland|helsinki|italy|milan|switzerland|zurich|austria|vienna|belgium|brussels|india|bangalore|hyderabad|singapore|japan|tokyo|australia|sydney|melbourne|brazil|sao paulo|mexico|latam|latin america|south america|argentina|colombia|chile|peru|uruguay|apac|asia|africa|dubai|abu dhabi|uae|united arab emirates|israel|tel aviv)/i;

const BARE_US = /(?:^|[\s,(])us(?:[\s,)]|$)/i;
const GLOBAL_REMOTE =
  /(anywhere|worldwide|work from anywhere|fully remote|100% remote|namer|north america|americas|global)/i;
const PLAIN_REMOTE = /(^|[\s(])remote([\s)]|$)/i;

/** Location gate: Canada, or location-agnostic. Anything naming another place is out. */
export function isEligibleLocation(location?: string | null): boolean {
  const loc = String(location ?? "").trim();
  if (!loc) return true;
  if (CANADA_RE.test(loc)) return true;
  if (BLOCK_REGION.test(loc) || BARE_US.test(loc)) return false;
  if (GLOBAL_REMOTE.test(loc)) return true;
  if (PLAIN_REMOTE.test(loc)) {
    // "Remote" alone is location-agnostic; "Remote - California" is not.
    const remainder = loc
      .replace(/\b(remote|fully|100%|work from home|wfh|hybrid)\b/gi, " ")
      .replace(/[(),;|+/\\-]+/g, " ")
      .trim();
    return remainder.length === 0;
  }
  return false;
}

export type FilterVerdict =
  | { ok: true; matched: string[]; matchedIn: "title" | "description" }
  | { ok: false; reason: string };

export function evaluatePosting(input: {
  title: string;
  description?: string | null;
  location?: string | null;
}): FilterVerdict {
  const title = input.title ?? "";
  const body = input.description ?? "";

  if (TITLE_EXCLUDE_RE.test(title)) return { ok: false, reason: "title-excluded" };
  if (!ENGINEERING_TITLE.test(title)) return { ok: false, reason: "not-engineering" };
  if (!SPECIALISM_TITLE.test(title)) return { ok: false, reason: "not-ai-or-fullstack" };

  const bodyLower = body.toLowerCase();
  if (EXCLUDE_BODY.some((phrase) => bodyLower.includes(phrase))) {
    return { ok: false, reason: "body-excluded" };
  }
  if (!isEligibleLocation(input.location)) return { ok: false, reason: "region-restricted" };

  const titleHits = MATCHERS.filter((m) => m.re.test(title)).map((m) => m.kw);
  if (titleHits.length === 0) return { ok: false, reason: "no-title-keyword" };

  if (!SENIOR_TITLE.test(title) && !STRONG_AI_TITLE.test(title)) {
    return { ok: false, reason: "not-senior" };
  }

  const bodyHits = MATCHERS.filter((m) => m.re.test(body)).map((m) => m.kw);
  return { ok: true, matched: [...new Set([...titleHits, ...bodyHits])], matchedIn: "title" };
}

export const isRelevant = (input: {
  title: string;
  description?: string | null;
  location?: string | null;
}) => evaluatePosting(input).ok;
