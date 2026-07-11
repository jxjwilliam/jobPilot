import {
  ParsedResumeSchema,
  type ParsedResume,
} from "@/lib/llm/schemas";

/** Strip markdown fences and validate as ParsedResume. */
export function extractJsonObject(text: string): ParsedResume {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in LLM response");
  }

  const jsonText = candidate.slice(start, end + 1);
  const raw = JSON.parse(jsonText) as unknown;
  return ParsedResumeSchema.parse(raw);
}
