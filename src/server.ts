/// <reference path="./types/express.d.ts" />
import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";

app.listen(env.PORT, () => {
  logger.info(`AdeTravel backend running on port ${env.PORT}`);
});
