/** Prefer assistant content; fall back to reasoning_content for reasoning models. */
export function getCompletionText(completion: {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    } | null;
  }>;
}): string {
  const message = completion.choices?.[0]?.message;
  if (!message) return "";
  const content = message.content?.trim();
  if (content) return content;
  return message.reasoning_content?.trim() ?? "";
}
