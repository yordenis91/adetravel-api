import { Router } from "express";
import { prisma } from "../lib/prisma";
import { createCatalogController } from "../controllers/catalog.controller";
import { catalogSchema, catalogQuerySchema } from "../validators/catalog.validator";
import { validate } from "../middlewares/validation.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import { idSchema } from "../schemas/domain.schemas";
import { asyncHandler } from "../utils/async-handler";

interface MountOptions {
  parentField?: string;
  parentRequired?: boolean;
  displayName: string;
  parent?: { delegate: any; displayName: string };
  children?: { delegate: any; label: string; singular: string; field: string }[];
}

function mountCatalog(delegate: any, entityName: string, opts: MountOptions): Router {
  const { parentField, parentRequired } = opts;
  const router = Router();
  const { list, getOne, create, update, remove, dependents } = createCatalogController(delegate, {
    entityName, parentField, parentRequired, displayName: opts.displayName,
    parentDelegate: opts.parent?.delegate, parentDisplayName: opts.parent?.displayName, children: opts.children,
  });
  const createSchema = catalogSchema(parentField, parentRequired);

  router.get("/", requirePermission("VIEW_CATALOGS"), validate(catalogQuerySchema, "query"), asyncHandler(list));
  router.get("/:id/dependents", requirePermission("VIEW_CATALOGS"), validate(idSchema, "params"), asyncHandler(dependents));
  router.get("/:id", requirePermission("VIEW_CATALOGS"), validate(idSchema, "params"), asyncHandler(getOne));
  router.post("/", requirePermission("MANAGE_CATALOGS"), validate(createSchema), asyncHandler(create));
  router.patch("/:id", requirePermission("MANAGE_CATALOGS"), validate(idSchema, "params"), validate(createSchema.partial()), asyncHandler(update));
  router.delete("/:id", requirePermission("MANAGE_CATALOGS"), validate(idSchema, "params"), asyncHandler(remove));

  return router;
}

// Un router por nomenclador (mismo patrón CRUD, ver catalog.controller.ts::createCatalogController).
export const countriesRouter = mountCatalog(prisma.country, "Country", {
  displayName: "país",
  children: [
    { delegate: prisma.city, label: "ciudades", singular: "ciudad", field: "countryId" },
    { delegate: prisma.region, label: "regiones", singular: "región", field: "countryId" },
  ],
});
export const citiesRouter = mountCatalog(prisma.city, "City", {
  parentField: "countryId", parentRequired: true, displayName: "ciudad", parent: { delegate: prisma.country, displayName: "el país" },
});
export const regionsRouter = mountCatalog(prisma.region, "Region", {
  parentField: "countryId", parentRequired: true, displayName: "región", parent: { delegate: prisma.country, displayName: "el país" },
});
export const nationalitiesRouter = mountCatalog(prisma.nationality, "Nationality", { displayName: "nacionalidad" });
export const carTypesRouter = mountCatalog(prisma.carType, "CarType", { displayName: "tipo de auto" });
export const carBrandsRouter = mountCatalog(prisma.carBrand, "CarBrand", {
  displayName: "marca", children: [{ delegate: prisma.carModel, label: "modelos", singular: "modelo", field: "carBrandId" }],
});
export const carModelsRouter = mountCatalog(prisma.carModel, "CarModel", {
  parentField: "carBrandId", parentRequired: true, displayName: "modelo", parent: { delegate: prisma.carBrand, displayName: "la marca" },
});
