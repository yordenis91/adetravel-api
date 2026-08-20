import { Router } from "express";
import { prisma } from "../lib/prisma";
import { createCatalogController } from "../controllers/catalog.controller";
import { catalogSchema, catalogQuerySchema } from "../validators/catalog.validator";
import { validate } from "../middlewares/validation.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { idSchema } from "../schemas/domain.schemas";
import { asyncHandler } from "../utils/async-handler";

function mountCatalog(delegate: any, entityName: string, parentField?: string, parentRequired?: boolean): Router {
  const router = Router();
  const { list, getOne, create, update, remove } = createCatalogController(delegate, { entityName, parentField, parentRequired });
  const createSchema = catalogSchema(parentField, parentRequired);

  router.get("/", requirePermission("VIEW_CATALOGS"), validate(catalogQuerySchema, "query"), asyncHandler(list));
  router.get("/:id", requirePermission("VIEW_CATALOGS"), validate(idSchema, "params"), asyncHandler(getOne));
  router.post("/", requirePermission("MANAGE_CATALOGS"), validate(createSchema), asyncHandler(create));
  router.patch("/:id", requirePermission("MANAGE_CATALOGS"), validate(idSchema, "params"), validate(createSchema.partial()), asyncHandler(update));
  router.delete("/:id", requirePermission("MANAGE_CATALOGS"), validate(idSchema, "params"), asyncHandler(remove));

  return router;
}

// Un router por nomenclador (mismo patrón CRUD, ver catalog.controller.ts::createCatalogController).
export const countriesRouter = mountCatalog(prisma.country, "Country");
export const citiesRouter = mountCatalog(prisma.city, "City", "countryId", true);
export const regionsRouter = mountCatalog(prisma.region, "Region", "countryId", true);
export const nationalitiesRouter = mountCatalog(prisma.nationality, "Nationality");
export const carTypesRouter = mountCatalog(prisma.carType, "CarType");
export const carBrandsRouter = mountCatalog(prisma.carBrand, "CarBrand");
export const carModelsRouter = mountCatalog(prisma.carModel, "CarModel", "carBrandId", true);
