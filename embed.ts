import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { pipeline } from "@xenova/transformers";
import { EmbeddingsInterface } from "@langchain/core/embeddings";

const CHROMA_URL = "http://localhost:9000/api/v2"; // Your ChromaDB URL
const COLLECTION_NAME = "alvin";
const COLLECTION_ID = "8026954b-caf2-4c67-85dc-118217693e39";
const TENANT_NAME = "alvin";
const DATABASE_NAME = "alvin";

const basicInfo = {
  firstname: "Alvin",
  middlename: "Sison",
  lastname: "Raquem",
  birthdate: "August 06, 1996",
  address: "Taguig City, Philippines",
  email: "alvin.raquem.se@gmail.com",
  hobbies: ["playing guitar", "watching animes", "playing dota2"],
};

async function storeEmbeddings() {
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

  const ids = chunkString.map((content, index) => crypto.randomUUID());

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

async function retrieveFromChroma(query: string) {
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

  const result = await response.json();
  console.log("Query results:", result);
  return result;
}
//storeEmbeddings();
retrieveFromChroma("What are alvin's full name?");
