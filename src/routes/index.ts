import { Router } from "express";
import { globalSearch } from "../controllers/search.controller";
import { authRouter } from "./auth.routes";
import { usersRouter } from "./users.routes";
import { clientsRouter } from "./clients.routes";
import { providersRouter } from "./providers.routes";
import { requestsRouter } from "./requests.routes";
import { servicesRouter } from "./services.routes";
import { quotationsRouter } from "./quotations.routes";
import { confirmationsRouter } from "./confirmations.routes";
import { paymentsRouter } from "./payments.routes";
import { vouchersRouter } from "./vouchers.routes";
import { activityLogsRouter } from "./activity-logs.routes";
import { systemConfigRouter } from "./system-config.routes";
import { emailTemplatesRouter } from "./email-templates.routes";
import { reportsRouter } from "./reports.routes";
import { tasksRouter } from "./tasks.routes";
import { notificationsRouter } from "./notifications.routes";
import {
  countriesRouter, citiesRouter, regionsRouter, nationalitiesRouter,
  carTypesRouter, carBrandsRouter, carModelsRouter
} from "./catalog.routes";
import { jobsRouter } from "./jobs.routes";
import { authMiddleware } from "../middlewares/auth.middleware";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use(authMiddleware);
apiRouter.use("/tasks", tasksRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/clients", clientsRouter);
apiRouter.use("/providers", providersRouter);
apiRouter.use("/requests", requestsRouter);
apiRouter.use("/services", servicesRouter);
apiRouter.use("/quotations", quotationsRouter);
apiRouter.use("/confirmations", confirmationsRouter);
apiRouter.use("/payments", paymentsRouter);
apiRouter.use("/vouchers", vouchersRouter);
apiRouter.use("/activity-logs", activityLogsRouter);
apiRouter.use("/system-config", systemConfigRouter);
apiRouter.use("/email-templates", emailTemplatesRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/countries", countriesRouter);
apiRouter.use("/cities", citiesRouter);
apiRouter.use("/regions", regionsRouter);
apiRouter.use("/nationalities", nationalitiesRouter);
apiRouter.use("/car-types", carTypesRouter);
apiRouter.use("/car-brands", carBrandsRouter);
apiRouter.use("/car-models", carModelsRouter);
apiRouter.use("/jobs", jobsRouter);
apiRouter.get("/search", globalSearch);