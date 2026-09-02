import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { errorHandler } from "./middlewares/error-handler.middleware";
import { sendError } from "./utils/response";

export const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false
  })
);

const healthCheck = (_req: express.Request, res: express.Response) => {
  res.json({ data: { status: "ok" } });
};

// El frontend consulta ${VITE_API_URL}/health; en producción VITE_API_URL ya
// incluye el sufijo /api, así que se registra en ambas rutas (antes del
// authMiddleware de apiRouter) para que no requiera autenticación.
app.get("/health", healthCheck);
app.get("/api/health", healthCheck);

app.use("/api", apiRouter);
app.use((_req, res) => sendError(res, "Ruta no encontrada", "NOT_FOUND", 404));
app.use(errorHandler);
