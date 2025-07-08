import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
// import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
// import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
// import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { pipeline } from "@xenova/transformers";

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
}

export type DataWithEmbeddings = {
  id: string;
  embedding: number[];
};

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}
