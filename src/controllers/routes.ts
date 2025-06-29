import llmRoutes from "@/controllers/llm/routes";
import fileRoutes from "@/controllers/file/routes";

export const routes = [llmRoutes, fileRoutes] as const;

export type AppRoutes = (typeof routes)[number];
