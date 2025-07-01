import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
export class EmbeddingUtility {
  static embedFile = async (file: File) => {
    const loader = new PDFLoader(file, { splitPages: true });
    const docs = await loader.load();
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await splitter.splitDocuments(docs);
    console.log("CHUNKS ARE:", JSON.stringify(chunks, null, 4));

    return;
  };
}
