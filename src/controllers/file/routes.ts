import { Hono } from "hono";
import { fileUploadController } from "./index";

const routes = new Hono().post("/file-upload", fileUploadController);

export default routes;
