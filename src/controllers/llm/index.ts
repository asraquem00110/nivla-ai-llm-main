import type { Context } from "hono";

export function sendMessageController(c: Context) {
  return c.text("Hello Products");
}
