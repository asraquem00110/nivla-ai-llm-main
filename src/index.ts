import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { routes } from "@/controllers/routes";
import { errorHandlerMiddleware } from "@/middlewares/error-handler";
import { envConfig } from "@/env";

const app = new Hono();

app.onError(errorHandlerMiddleware);

/* Routes */
routes.forEach((route) => {
  app.route("/", route);
});

serve(
  {
    fetch: app.fetch,
    port: envConfig.APP_PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
