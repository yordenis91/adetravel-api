/// <reference path="./types/express.d.ts" />
import "./instrument";
import * as Sentry from "@sentry/node";
import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { registerJobs } from "./jobs";
import { prisma } from "./lib/prisma";

// Un error no manejado deja al proceso en un estado potencialmente
// corrupto (conexiones a medio abrir, timers huérfanos, etc.). Seguir
// sirviendo tráfico después de esto es justamente lo que Node.js
// desaconseja: en vez de quedar "vivo pero roto" indefinidamente (y sin
// que nada lo reinicie, porque /health no tenía forma de detectarlo),
// se reporta a Sentry y se deja morir al proceso para que Easypanel
// levante un contenedor limpio.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
  Sentry.captureException(reason);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  Sentry.captureException(err);
  process.exit(1);
});

const server = app.listen(env.PORT, "0.0.0.0", () => {
  logger.info(`AdeTravel backend running on port ${env.PORT}`);
  registerJobs();
});

// Apagado ordenado ante SIGTERM/SIGINT (lo que envía Easypanel/Docker al
// reiniciar o redesplegar el contenedor): deja de aceptar conexiones
// nuevas, cierra la conexión a la base y recién ahí sale. Sin esto, un
// redeploy puede cortar en seco una request a medio procesar.
function shutdown(signal: string) {
  logger.info(`${signal} recibido, cerrando servidor de forma ordenada...`);
  const forceExit = setTimeout(() => {
    logger.error("Apagado ordenado tardó demasiado, forzando salida");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Servidor cerrado correctamente");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
