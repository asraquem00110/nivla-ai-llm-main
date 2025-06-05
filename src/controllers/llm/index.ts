import type { Context, Next } from "hono";

export async function sendMessageController(c: Context, next: Next) {
  // c.header("Content-Type", "text/event-stream");
  // c.header("Cache-Control", "no-cache");
  const stream = new ReadableStream({
    async start(controller) {
      // Simulate an async stream (you could replace this with your own stream logic)
      for (let i = 0; i < 5; i++) {
        controller.enqueue(`Chunk ${i}\n`);
        await new Promise((r) => setTimeout(r, 500));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      // "Content-Type": "text/plain",
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
