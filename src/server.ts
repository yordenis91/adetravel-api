/// <reference path="./types/express.d.ts" />
import "./instrument";
import * as Sentry from "@sentry/node";
import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { registerJobs } from "./jobs";

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
  Sentry.captureException(reason);
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  Sentry.captureException(err);
});

app.listen(env.PORT, "0.0.0.0", () => {
  logger.info(`AdeTravel backend running on port ${env.PORT}`);
  registerJobs();
});
