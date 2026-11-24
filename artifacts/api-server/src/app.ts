import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import router from "./routes";
import { describeError, logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { requireSameOrigin } from "./middlewares/sameOrigin";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk's proxy handles raw requests and must run before body parsing.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(helmet());
app.use(express.json({ limit: "150kb" }));
app.use(express.urlencoded({ extended: true, limit: "150kb" }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);
const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.path === "/healthz",
  keyGenerator: (req) => {
    const professionalId = getAuth(req).userId;
    return professionalId
      ? `professional:${professionalId}`
      : `anonymous:${ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "127.0.0.1")}`;
  },
});
app.use("/api", requireSameOrigin);
app.use("/api", apiRateLimit);
app.use("/api", router);

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  // Não logar o erro bruto: erros do Drizzle/pg carregam a query e os valores
  // (nome, e-mail, telefone de pacientes) na mensagem.
  req.log.error({ error: describeError(error) }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Erro interno do servidor." });
});

export default app;
