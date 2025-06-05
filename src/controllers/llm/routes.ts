import { Hono } from "hono";
import { sendMessageController } from "./index.js";

const routes = new Hono().post("/send-message", sendMessageController);

export default routes;
