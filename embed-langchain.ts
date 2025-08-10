import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { pipeline } from "@xenova/transformers";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Document } from "@langchain/core/documents";

const CHROMA_URL = "http://localhost:9000/api/v2"; // Your ChromaDB URL
const COLLECTION_NAME = "my-information";
const COLLECTION_ID = "376b7001-914c-41ca-89f4-20fabccaec11";
const TENANT_NAME = "default_tenant";
const DATABASE_NAME = "default_database";

const basicInfo = {
  firstname: "Alvin",
  middlename: "Sison",
  lastname: "Raquem",
  birthdate: "August 06, 1996",
  address: "Taguig City, Philippines",
  email: "alvin.raquem.se@gmail.com",
  hobbies: ["playing guitar", "watching animes", "playing dota2"],
};

class PrecomputedEmbeddings implements EmbeddingsInterface {
  private embeddings: number[][];

  constructor(embeddings: number[][]) {
    this.embeddings = embeddings;
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return this.embeddings;
  }

  async embedQuery(_text: string): Promise<number[]> {
    throw new Error("embedQuery not implemented for precomputed embeddings.");
  }
}

// Custom local embedding wrapper
class XenovaEmbeddings {
  constructor(private embedder: any) {}

  async embedQuery(text: string): Promise<number[]> {
    const res = await this.embedder(text, { pooling: "mean", normalize: true });
    return Array.from(res.data);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const results = await Promise.all(
      texts.map((text) =>
        this.embedder(text, { pooling: "mean", normalize: true }).then(
          (res: any) => Array.from(res.data)
        )
      )
    );
    return results;
  }
}

async function main() {
  const file = "../RAQUEM-RESUME.pdf";
  const loader = new PDFLoader(file, { splitPages: true });
  const docs = await loader.load();
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 100,
  });
  const chunks = await splitter.splitDocuments(docs);

  const chunkString = chunks.map((chunk) => chunk.pageContent);
  chunkString.push(JSON.stringify(basicInfo));

  const embedder = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );

  const embeddings = new XenovaEmbeddings(embedder);
  const langchainDocs = chunkString.map((chunk, index) => {
    return new Document({
      pageContent: chunk,
      id: crypto.randomUUID(),
      metadata: {
        source: `chunk-${index}`,
        chunkIndex: index,
        originalFile: file,
      },
    });
  });

  const vectorStore = await Chroma.fromDocuments(langchainDocs, embeddings, {
    collectionName: COLLECTION_NAME,
    url: "http://localhost:9000", // Make sure Chroma is running
  });

  console.log("Vector store created successfully:", vectorStore);

  return;
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

  const ids = chunkString.map((content, index) => crypto.randomUUID.toString());

  const chromaData = {
    documents: chunkString,
    embeddings: chunkEmbeddings,
    ids,
  };

  const response = await fetch(
    `${CHROMA_URL}/tenants/${TENANT_NAME}/databases/${DATABASE_NAME}/collections/${COLLECTION_ID}/add`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chromaData),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to add points to Chroma: ${response.status} ${text}`
    );
  }

  console.log(
    "Successfully added points to Chroma collection:",
    COLLECTION_NAME
  );
}

main();
