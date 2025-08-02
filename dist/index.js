// src/index.ts
import { serve } from "@hono/node-server";
import { Hono as Hono3 } from "hono";
import { cors } from "hono/cors";

// src/controllers/llm/routes.ts
import { Hono } from "hono";

// src/utils/rag-utility.ts
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { pipeline } from "@xenova/transformers";
var RagUtility = class {
  static embedFile = async (file, question) => {
    const loader = new PDFLoader(file, { splitPages: true });
    const docs = await loader.load();
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100
    });
    const chunks = await splitter.splitDocuments(docs);
    const chunkString = chunks.map((chunk) => chunk.pageContent);
    const embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
    const chunkTensor = await embedder(chunkString, {
      pooling: "mean",
      normalize: true
    });
    const chunkEmbeddings = [];
    const data = Array.from(chunkTensor.data);
    const dim = chunkTensor.dims?.[1];
    if (dim === void 0) {
      throw new Error("chunkTensor.dims[1] is undefined.");
    }
    for (let i = 0; i < data.length; i += dim) {
      chunkEmbeddings.push(data.slice(i, i + dim));
    }
    const questionTensor = await embedder([question], {
      pooling: "mean",
      normalize: true
    });
    const queryEmbedding = Array.from(questionTensor.data);
    const scoredChunks = chunkString.map((content, i) => ({
      content,
      score: cosineSimilarity(
        queryEmbedding,
        chunkEmbeddings[i]
      )
    }));
    const topChunks = scoredChunks.sort((a, b) => b.score - a.score).slice(0, 3);
    topChunks.forEach((chunk) => {
      console.log(`Chunk: ${chunk.content}, Score: ${chunk.score}`);
    });
    return topChunks[0]?.content || "";
  };
};
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}

// src/controllers/llm/index.ts
import { Ollama } from "ollama";
var ollama = new Ollama({ host: "http://127.0.0.1:11434" });
async function sendMessageController(c, next) {
  let ragContent = null;
  const body = await c.req.parseBody();
  const { messages: reqMessages, tools: reqTools, file } = body;
  const messages = JSON.parse(reqMessages);
  const tools = JSON.parse(reqTools);
  console.log("FILE:", file);
  if (file) {
    const lastMessage = messages[messages.length - 1]?.message;
    ragContent = await RagUtility.embedFile(
      file,
      lastMessage
    );
  }
  if (ragContent && ragContent !== "") {
    messages.push({
      role: "system",
      message: `Context: ${ragContent}`
    });
  }
  let formattedOllamaTools = [];
  if (tools && tools.length > 0) {
    formattedOllamaTools = tools.map((tool) => {
      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties: tool.inputSchema.properties,
            required: tool.inputSchema.required
          }
        }
      };
    });
  }
  const llmMessages = [
    ...messages.map((msg) => ({
      role: msg.role,
      content: msg.message
    }))
  ];
  const response = await ollama.chat({
    model: "qwen3:1.7b",
    messages: llmMessages,
    keep_alive: 10,
    stream: true,
    tools: formattedOllamaTools
  });
  const stream = new ReadableStream({
    async start(controller) {
      if (typeof response[Symbol.asyncIterator] === "function") {
        for await (const part of response) {
          const data = `data: ${JSON.stringify(part.message.content)}

`;
          const toolsCalled = `tools_called: ${JSON.stringify(
            part.message.tool_calls
          )}

`;
          const doneReason = `done_reason: ${part.done_reason}

`;
          controller.enqueue(new TextEncoder().encode(data));
          controller.enqueue(new TextEncoder().encode(toolsCalled));
          controller.enqueue(new TextEncoder().encode(doneReason));
        }
      } else {
        const part = response;
        console.log("SINGLE PART:", JSON.stringify(part, null, 4));
        const data = `data: ${JSON.stringify(part.message.content)}

`;
        const toolsCalled = `tools_called: ${JSON.stringify(
          part.message.tool_calls
        )}

`;
        const doneReason = `done_reason: ${part.done_reason}

`;
        controller.enqueue(new TextEncoder().encode(data));
        controller.enqueue(new TextEncoder().encode(toolsCalled));
        controller.enqueue(new TextEncoder().encode(doneReason));
      }
      controller.close();
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain",
      // OR 'text/event-stream' for SSE
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}

// src/controllers/llm/routes.ts
var routes = new Hono().post("/send-message", sendMessageController);
var routes_default = routes;

// src/controllers/file/routes.ts
import { Hono as Hono2 } from "hono";

// src/controllers/file/index.ts
import fs from "fs/promises";
import path from "path";
async function fileUploadController(c, next) {
  const body = await c.req.parseBody();
  console.log("File upload controller called");
  console.log(body);
  const file = body.file;
  if (!file) {
    return c.json({ error: "No file uploaded" }, 400);
  }
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const uploadDir = path.resolve(process.cwd(), "src/files");
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, file.name);
  await fs.writeFile(filePath, buffer);
  return c.json("Uploaded file successfully", 200);
}

// src/controllers/file/routes.ts
var routes2 = new Hono2().post("/file-upload", fileUploadController);
var routes_default2 = routes2;

// src/controllers/routes.ts
var routes3 = [routes_default, routes_default2];

// src/utils/error.ts
import { StatusCodes } from "http-status-codes";
var BadRequestError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "BadRequestError";
    this.message = message;
  }
};
var UnauthorizedError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "UnauthorizedError";
    this.message = message;
  }
};
var ForbiddenError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ForbiddenError";
    this.message = message;
  }
};
var NotFoundError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.message = message;
  }
};
var ConflictError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ConflictError";
    this.message = message;
  }
};
function makeError(error) {
  const defaultError = {
    name: error.name,
    message: error.message
  };
  if (error.message.includes("Malformed JSON")) {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      error: { name: "BadRequestError", message: error.message }
    };
  }
  if (error instanceof BadRequestError) {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      error: defaultError
    };
  }
  if (error instanceof UnauthorizedError) {
    return {
      statusCode: StatusCodes.UNAUTHORIZED,
      error: defaultError
    };
  }
  if (error instanceof ForbiddenError) {
    return {
      statusCode: StatusCodes.FORBIDDEN,
      error: defaultError
    };
  }
  if (error instanceof NotFoundError) {
    return {
      statusCode: StatusCodes.NOT_FOUND,
      error: defaultError
    };
  }
  if (error instanceof ConflictError) {
    return {
      statusCode: StatusCodes.CONFLICT,
      error: defaultError
    };
  }
  return {
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    error: defaultError
  };
}

// src/middlewares/error-handler.ts
async function errorHandlerMiddleware(err, c) {
  const { error, statusCode } = makeError(err);
  console.error(error.message, error);
  return c.json(error, { status: statusCode });
}

// src/env.ts
import { config } from "dotenv";
import { z } from "zod";
config();
var envSchema = z.object({
  APP_PORT: z.coerce.number().default(3e3),
  HUGGINGFACE_API_KEY: z.string()
});
var envConfig = envSchema.parse({
  APP_PORT: process.env.APP_PORT,
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY
});

// src/index.ts
var app = new Hono3();
app.use(
  "/*",
  cors({
    origin: ["http://localhost:5173"],
    allowHeaders: ["*"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length", "X-Kuma-Revision", "Content-Type"],
    maxAge: 600,
    credentials: true
  })
);
app.onError(errorHandlerMiddleware);
routes3.forEach((route) => {
  app.route("/", route);
});
serve(
  {
    fetch: app.fetch,
    port: envConfig.APP_PORT
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
//# sourceMappingURL=index.js.map