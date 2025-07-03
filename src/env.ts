import { config } from "dotenv";
import { z } from "zod";

config();

export function isTest() {
  return process.env.NODE_ENV === "test";
}

const envSchema = z.object({
  APP_PORT: z.coerce.number().default(3000),
  HUGGINGFACE_API_KEY: z.string(),
});

export const envConfig = envSchema.parse({
  APP_PORT: process.env.APP_PORT,
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,
});

export type EnvConfig = z.infer<typeof envSchema>;
