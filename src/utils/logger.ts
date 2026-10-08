import pino from "pino";
import { env } from "../config/env";
import { currentRequestId } from "./request-context";
import { errorToSafeObject, maskText, scrub } from "./pii-scrub";

/**
 * Logger estructurado (JSON en producción). Sin datos personales: las claves sensibles se filtran
 * y los textos se enmascaran (ver ./pii-scrub.ts). Cada línea emitida durante una petición lleva su
 * `requestId`, el mismo que se devuelve al cliente en la cabecera `X-Request-Id`.
 */
const DEFAULT_LEVEL =
  env.NODE_ENV === "production"
    ? "info"
    : env.NODE_ENV === "test"
      ? "silent"
      : "debug";

/** Fábrica del logger; las pruebas la usan con otro nivel y destino para leer lo que se escribe. */
export function createLogger(
  options: { level?: string; destination?: pino.DestinationStream } = {},
) {
  return pino(
    {
      level: options.level ?? DEFAULT_LEVEL,
      base: { service: "adetravel-api", env: env.NODE_ENV },
      mixin() {
        const requestId = currentRequestId();
        return requestId ? { requestId } : {};
      },
      formatters: {
        // Todo objeto que se registra pasa por el filtro (incluidos `result`, `error`, `details`...).
        log: (obj) => scrub(obj),
      },
      serializers: {
        err: serializeError,
        error: serializeError,
      },
      hooks: {
        // El mensaje de texto también se enmascara (p. ej. "No se pudo enviar a ana@x.cl").
        logMethod(args, method) {
          method.apply(
            this,
            args.map((a) =>
              typeof a === "string" ? maskText(a) : a,
            ) as Parameters<typeof method>,
          );
        },
      },
      transport:
        env.NODE_ENV === "development" && !options.destination
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    options.destination,
  );
}

export const logger = createLogger();

/** Error serializado sin datos personales (ver errorToSafeObject). */
export function serializeError(err: unknown): unknown {
  return err instanceof Error ? errorToSafeObject(err) : scrub(err);
}
