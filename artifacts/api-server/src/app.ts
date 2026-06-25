import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(pinoHttp({
  logger,
  serializers: {
    req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
    res(res) { return { statusCode: res.statusCode }; },
  },
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// dist/index.mjs lives in dist/ — public/ is at dist/../public = api-server/public
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(join(publicDir, "index.html"));
  });
}

export default app;
