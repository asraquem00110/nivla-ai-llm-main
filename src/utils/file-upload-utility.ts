import path from "path";
import fs from "fs/promises";

export class FileUploadUtility {
  static upload = async (file: File): Promise<boolean> => {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadDir = path.resolve(process.cwd(), "src/files");
    await fs.mkdir(uploadDir, { recursive: true });

    const filePath = path.join(uploadDir, file.name);
    await fs.writeFile(filePath, buffer);

    return true;
  };
}

export type UploadReturnType = Awaited<
  ReturnType<typeof FileUploadUtility.upload>
>;
