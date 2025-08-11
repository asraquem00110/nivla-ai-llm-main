import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
// import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
// import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
// import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { pipeline } from "@xenova/transformers";

const CHROMA_URL = "http://localhost:9000/api/v2"; // Your ChromaDB URL
const COLLECTION_NAME = "alvin";
const COLLECTION_ID = "8026954b-caf2-4c67-85dc-118217693e39";
const TENANT_NAME = "alvin";
const DATABASE_NAME = "alvin";

// Define a type for the ChromaDB response
type ChromaDBQueryResponse = {
  ids: string[][];
  distances: number[][];
  embeddings?: number[][][]; // Optional, depending on ChromaDB config
  documents?: string[][];
  metadatas?: Record<string, any>[][];
};
export class RagUtility {
  static embedFile = async (file: File, question: string) => {
    const loader = new PDFLoader(file, { splitPages: true });
    const docs = await loader.load();
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 100,
    });
    const chunks = await splitter.splitDocuments(docs);

    const chunkString = chunks.map((chunk) => chunk.pageContent);

    const embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );

    const chunkTensor = await embedder(chunkString, {
      pooling: "mean",
      normalize: true,
    });
    const chunkEmbeddings: number[][] = [];
    const data = Array.from(chunkTensor.data);
    const dim = chunkTensor.dims?.[1];

    if (dim === undefined) {
      throw new Error("chunkTensor.dims[1] is undefined.");
    }

    for (let i = 0; i < data.length; i += dim) {
      chunkEmbeddings.push(data.slice(i, i + dim));
    }

    const questionTensor = await embedder([question], {
      pooling: "mean",
      normalize: true,
    });

    const queryEmbedding = Array.from(questionTensor.data);

    const scoredChunks = chunkString.map((content, i) => ({
      content,
      score: cosineSimilarity(
        queryEmbedding,
        chunkEmbeddings[i] as unknown as number[]
      ),
    }));

    const topChunks = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    topChunks.forEach((chunk) => {
      console.log(`Chunk: ${chunk.content}, Score: ${chunk.score}`);
    });

    return topChunks[0]?.content || "";
  };

  static async retrieveFromChromaDB(query: string): Promise<string> {
    const embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );

    const queryTensor = await embedder([query], {
      pooling: "mean",
      normalize: true,
    });
    const queryEmbedding = Array.from(queryTensor.data);

    const response = await fetch(
      `${CHROMA_URL}/tenants/${TENANT_NAME}/databases/${DATABASE_NAME}/collections/${COLLECTION_ID}/query`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query_embeddings: [queryEmbedding],
          n_results: 3, // Limit the number of results returned
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to query Chroma: ${response.status} ${text}`);
    }

    const result = (await response.json()) as ChromaDBQueryResponse;
    console.log("Query results:", result);

    return result?.documents?.[0]?.[0] || "No relevant context found.";
  }
}

export type DataWithEmbeddings = {
  id: string;
  embedding: number[];
};

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i]!, 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}
