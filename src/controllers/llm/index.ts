import { RagUtility } from "@/utils/rag-utility";
import { FileUploadUtility } from "@/utils/file-upload-utility";
import type { Context, Next } from "hono";
import { Ollama } from "ollama";

const ollama = new Ollama({ host: "http://127.0.0.1:11434" });

export async function sendMessageController(c: Context, next: Next) {
  let ragContent = null;
  const body = await c.req.parseBody();
  const { messages: reqMessages, tools: reqTools, file } = body;

  const messages = JSON.parse(reqMessages as string) as {
    role: string;
    message: string;
  }[];
  const tools = JSON.parse(reqTools as string);

  console.log("FILE:", file);

  if (file) {
    // await FileUploadUtility.upload(file as File);
    const lastMessage =
      messages[(messages.length - 1) as unknown as number]?.message;
    ragContent = await RagUtility.embedFile(
      file as File,
      lastMessage as unknown as string
    );
  }

  if (ragContent && ragContent !== "") {
    messages.push({
      role: "system",
      message: `Context: ${ragContent}`,
    });
  }

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

  const llmMessages = [
    ...messages.map((msg: any) => ({
      role: msg.role,
      content: msg.message,
    })),
  ];

  const response = await ollama.chat({
    model: "qwen3:1.7b",
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
