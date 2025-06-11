import type { Context, Next } from "hono";
import { Ollama } from "ollama";

const ollama = new Ollama({ host: "http://127.0.0.1:11434" });

export async function sendMessageController(c: Context, next: Next) {
  const body = await c.req.json();
  const { messages, tools } = body;

  let formattedOllamaTools: any[] = [];
  if (tools && tools.length > 0) {
    formattedOllamaTools = tools.map((tool: any) => {
      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties: tool.inputSchema.properties,
            required: tool.inputSchema.required,
          },
        },
      };
    });
  }

  const haveTools = formattedOllamaTools.length > 0 ? true : false;
  // Build llmMessages with system prompt
  const llmMessages = [
    {
      role: "system",
      content: `You are Agent A. Decide if the user's input should be handled by another agent.
        
        Capabilities of Agent B:
        - Analyze invoices
        - Answer tax-related questions
        - Classify expense receipts

        Capabilities of Agent C:
        - Analyze weather
        - Answer weather-related questions
        - Answer How Hot or Cold places are

        Respond with: <agent>Agent {AgentName}</agent> if agent is need to be called else handle by Agent A.
        If agent calling is not needed and tools are available, check if any tool should be used to handle the user's input. If so, respond accordingly.
      `,
    },
    ...messages.map((msg: any) => ({
      role: msg.role,
      content: msg.message,
    })),
  ];

  // const response = haveTools
  //   ? await ollama.chat({
  //       model: "qwen3:0.6b",
  //       messages: llmMessages,
  //       keep_alive: 10,
  //       stream: false,
  //       tools: formattedOllamaTools,
  //     })
  //   : await ollama.chat({
  //       model: "qwen3:0.6b",
  //       messages: llmMessages,
  //       keep_alive: 10,
  //       stream: true,
  //       tools: formattedOllamaTools,
  //     });

  // if (haveTools) {
  //   // Non-streaming response
  //   console.log(response);
  //   return c.json(response);
  // }

  const response = await ollama.chat({
    model: "qwen3:0.6b",
    messages: llmMessages,
    keep_alive: 10,
    stream: true,
    tools: formattedOllamaTools,
  });
  // Streaming response
  const stream = new ReadableStream({
    async start(controller) {
      if (typeof (response as any)[Symbol.asyncIterator] === "function") {
        for await (const part of response as AsyncIterable<any>) {
          const data = `data: ${JSON.stringify(part.message.content)}\n\n`;
          const toolsCalled = `tools_called: ${JSON.stringify(
            part.message.tool_calls
          )}\n\n`;
          const doneReason = `done_reason: ${part.done_reason}\n\n`;

          controller.enqueue(new TextEncoder().encode(data));
          controller.enqueue(new TextEncoder().encode(toolsCalled));
          controller.enqueue(new TextEncoder().encode(doneReason));
        }
      } else {
        // Handle the case where response is a single object
        const part = response as any;
        console.log("SINGLE PART:", JSON.stringify(part, null, 4));
        const data = `data: ${JSON.stringify(part.message.content)}\n\n`;
        const toolsCalled = `tools_called: ${JSON.stringify(
          part.message.tool_calls
        )}\n\n`;
        const doneReason = `done_reason: ${part.done_reason}\n\n`;

        controller.enqueue(new TextEncoder().encode(data));
        controller.enqueue(new TextEncoder().encode(toolsCalled));
        controller.enqueue(new TextEncoder().encode(doneReason));
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
