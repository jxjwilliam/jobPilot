import OpenAI from "openai";

export function getLlmClient() {
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
  const baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL;
  if (!apiKey || !baseURL) throw new Error("LLM env not configured");
  return new OpenAI({ apiKey, baseURL });
}

export function getLlmModel() {
  return process.env.OPENAI_COMPATIBLE_MODEL ?? "deepseek-chat";
}
