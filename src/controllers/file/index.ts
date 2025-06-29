import { Context, Next } from "hono";
import fs from "fs/promises";
import path from "path";

export async function fileUploadController(c: Context, next: Next) {
  const body = await c.req.parseBody();
  console.log("File upload controller called");
  console.log(body);

  const file = body.file as File;
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
