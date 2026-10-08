// Debe importarse antes que cualquier otro módulo (server.ts) para que
// Sentry pueda instrumentar correctamente. Ver https://docs.sentry.io/platforms/node/
import * as Sentry from "@sentry/node";
import { scrubSentryBreadcrumb, scrubSentryEvent } from "./utils/sentry-scrub";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
    // Sin IP, cookies ni cuerpo de las peticiones; lo que quede se filtra en beforeSend.
    sendDefaultPii: false,
    beforeSend: (event) => scrubSentryEvent(event),
    beforeSendTransaction: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
  });
}
