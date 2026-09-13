import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { apiRouter } from "./routes";
import { errorHandler } from "./middlewares/error-handler.middleware";
import { sendError } from "./utils/response";
import { prisma } from "./lib/prisma";
import { logger } from "./utils/logger";

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

const healthCheck = async (_req: express.Request, res: express.Response) => {
  try {
    // Verifica conectividad real con la base, no solo que el proceso esté vivo.
    // Sin esto, Easypanel nunca se entera si la DB se cayó: el endpoint
    // siempre respondía "ok" aunque toda la API estuviera rota.
    await prisma.$queryRaw`SELECT 1`;
    res.json({ data: { status: "ok" } });
  } catch (err) {
    logger.error({ err }, "Health check: base de datos no responde");
    res.status(503).json({ data: { status: "error" } });
  }
};

// El frontend consulta ${VITE_API_URL}/health; en producción VITE_API_URL ya
// incluye el sufijo /api, así que se registra en ambas rutas (antes del
// authMiddleware de apiRouter) para que no requiera autenticación.
//
// Registradas ANTES del rate limiter a propósito: Easypanel hace polling
// periódico de este endpoint, y si comparte el límite global (100 req/15min)
// con el resto de la API, el propio health check puede terminar devolviendo
// 429 — Easypanel lo interpreta como contenedor caído y lo reinicia sin que
// haya ningún problema real. Esto probablemente contribuyó a la inestabilidad
// de reinicios que se vio en producción.
app.get("/health", healthCheck);
app.get("/api/health", healthCheck);

app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use("/api", apiRouter);
app.use((_req, res) => sendError(res, "Ruta no encontrada", "NOT_FOUND", 404));
app.use(errorHandler);
