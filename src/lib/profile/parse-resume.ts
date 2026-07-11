import "server-only";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { getLlmClient, getLlmModel } from "@/lib/llm/client";
import type { ParsedResume } from "@/lib/llm/schemas";
import { emptyParsedResume } from "@/lib/profile/types";
import { extractJsonObject } from "@/lib/profile/extract-json";

export { extractJsonObject } from "@/lib/profile/extract-json";

async function extractTextFromBuffer(
  buffer: Buffer,
  mimeOrName: string
): Promise<string> {
  const hint = mimeOrName.toLowerCase();
  const isPdf = hint.includes("pdf") || hint.endsWith(".pdf");
  const isDocx =
    hint.includes("wordprocessingml") ||
    hint.includes("docx") ||
    hint.endsWith(".docx") ||
    hint.includes("msword");

  if (isPdf) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text ?? "";
    } finally {
      await parser.destroy();
    }
  }

  if (isDocx) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  return buffer.toString("utf8");
}

export type ParseResumeResult = {
  parsed: ParsedResume;
  error?: string;
};

const EXTRACTION_PROMPT = `Extract a structured resume from the following text.
Return ONLY a JSON object with this shape (no markdown outside the object):
{
  "summary": string,
  "skills": string[],
  "experience": [{ "title": string, "company": string, "start"?: string, "end"?: string, "bullets": string[] }],
  "education": [{ "school": string, "degree"?: string, "year"?: string }]
}`;

export async function parseResumeFromBuffer(
  buffer: Buffer,
  mimeOrName: string
): Promise<ParseResumeResult> {
  try {
    const text = await extractTextFromBuffer(buffer, mimeOrName);
    if (!text.trim()) {
      return {
        parsed: emptyParsedResume(),
        error: "Could not extract text from resume file",
      };
    }

    const client = getLlmClient();
    const completion = await client.chat.completions.create({
      model: getLlmModel(),
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You extract structured resume data as JSON. Never invent employers or degrees not present in the source.",
        },
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\n---\n${text.slice(0, 60_000)}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const parsed = extractJsonObject(content);
    return { parsed };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Resume parse failed";
    return { parsed: emptyParsedResume(), error: message };
  }
}
