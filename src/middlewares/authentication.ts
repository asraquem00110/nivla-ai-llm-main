import { UnauthorizedError } from "@/utils/error";
import { Context, Next } from "hono";

export async function authenticationMiddleware(c: Context, next: Next) {
  const accessToken = c.req.header("Authorization")?.split("Bearer ")[1];

  if (!accessToken) {
    throw new UnauthorizedError("Access token is required");
  }

  await next();
}
