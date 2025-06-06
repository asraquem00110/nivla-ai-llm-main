import type { Context, Next } from "hono";
import { Ollama } from "ollama";

const ollama = new Ollama({ host: "http://127.0.0.1:11434" });

export async function sendMessageController(c: Context, next: Next) {
  const body = await c.req.json();
  const { messages, tools } = body;
  console.log("Received body:", body);

  // return c.json({
  //   message: "Message received",
  // });

  const response = await ollama.chat({
    model: "qwen3:0.6b",
    messages: messages.map((msg: any) => ({
      role: msg.role,
      content: msg.message,
    })),
    stream: true,
    keep_alive: 10,
    tools,
  });

  const stream = new ReadableStream({
    async start(controller) {
      for await (const part of response) {
        const data = `data: ${JSON.stringify(part.message.content)}\n\n`;
        const toolsCalled = `tools_called: ${JSON.stringify(
          part.message.tool_calls
        )}\n\n`;
        const doneReason = `done_reason: ${part.done_reason}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));
        controller.enqueue(new TextEncoder().encode(toolsCalled));
        controller.enqueue(new TextEncoder().encode(doneReason));
        // console.log("Streamed part:", part);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain", // OR 'text/event-stream' for SSE
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
