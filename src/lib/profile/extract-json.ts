import {
  ParsedResumeSchema,
  type ParsedResume,
} from "@/lib/llm/schemas";

/** Strip markdown fences and return parsed JSON value (not schema-validated). */
export function extractJsonObjectRaw(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in LLM response");
  }

  const jsonText = candidate.slice(start, end + 1);
  return JSON.parse(jsonText) as unknown;
}

/** Strip markdown fences and validate as ParsedResume. */
export function extractJsonObject(text: string): ParsedResume {
  return ParsedResumeSchema.parse(extractJsonObjectRaw(text));
}
