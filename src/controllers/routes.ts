import llmRoutes from "@/controllers/llm/routes";

export const routes = [llmRoutes] as const;

export type AppRoutes = (typeof routes)[number];
