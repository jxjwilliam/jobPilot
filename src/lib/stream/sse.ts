/**
 * Lightweight Server-Sent Events helper using Web Streams API.
 * No dependencies — works with any Next.js Route Handler.
 */

export type SseEvent =
  | { type: "progress"; [key: string]: unknown }
  // Tailor pipeline steps (split resume + cover letter)
  | { type: "resume_start" }
  | { type: "resume_done" }
  | { type: "cover_start" }
  | { type: "cover_done" }
  | { type: "done"; [key: string]: unknown }
  | { type: "error"; message: string };

/**
 * Create a pair of (ReadableStream, send function) for SSE.
 *
 * The stream is a valid SSE response body that you can return
 * from a Next.js Route Handler with:
 *   new Response(stream, {
 *     headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }
 *   })
 *
 * Call `send(event)` to push a typed event onto the stream.
 * Call `close()` to end the stream.
 */
export function createSseStream(): {
  stream: ReadableStream<Uint8Array>;
  send: (event: SseEvent) => void;
  close: () => void;
  error: (message: string) => void;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  function send(event: SseEvent) {
    if (!controller) return;
    const data = JSON.stringify(event);
    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
  }

  function close() {
    if (!controller) return;
    controller.enqueue(encoder.encode("data: {\"type\":\"close\"}\n\n"));
    controller.close();
  }

  function error(message: string) {
    if (!controller) return;
    send({ type: "error", message });
    close();
  }

  return { stream, send, close, error };
}
