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
  const lastMessage = messages[messages.length - 1]?.message;

  if (file) {
    // await FileUploadUtility.upload(file as File);
    ragContent = await RagUtility.embedFile(
      file as File,
      lastMessage as string
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

  const ragInternalContext = await RagUtility.retrieveFromChromaDB(
    lastMessage as string
  );

  const llmMessages = [
    {
      role: "system",
      content: `You are a helpful assistant.

You have access to a set of tools that can be called to help answer questions. If a tool is needed, respond with a JSON object in the following format:

{
  "tool": "<tool_name>",
  "parameters": { ... }
}

If you do not need to call a tool, respond with a plain text answer.

You will also be provided with context relevant to the question. Use this context to guide your answer. If the context is insufficient, fall back on your own knowledge to respond.

If you are unsure or cannot answer reliably, state that clearly.

Here are the internal RAG context btw: ${ragInternalContext}`,
    },
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
