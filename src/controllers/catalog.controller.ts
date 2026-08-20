import { Request, Response } from "express";
import { ApiError } from "../utils/api-error";
import { sendItem, sendList } from "../utils/response";
import { createActivityLog } from "../services/activity-log.service";

// Forma mínima común a los 7 delegados de Prisma usados como nomencladores
// (Country/City/Region/Nationality/CarType/CarBrand/CarModel).
interface CatalogDelegate {
  findMany: (args?: unknown) => Promise<Record<string, unknown>[]>;
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
  update: (args: unknown) => Promise<Record<string, unknown>>;
}

interface CatalogConfig {
  entityName: string;
  /** Nombre del campo FK al catálogo padre (p.ej. "countryId" para City/Region). */
  parentField?: string;
  parentRequired?: boolean;
}

/**
 * Factory de controlador CRUD genérico para nomencladores. Evita repetir 7 controladores
 * casi idénticos — cada catálogo comparte la misma forma { id, name, isActive, createdAt,
 * updatedAt } más, opcionalmente, una única FK al catálogo padre.
 */
export function createCatalogController(delegate: CatalogDelegate, config: CatalogConfig) {
  async function list(req: Request, res: Response): Promise<void> {
    const search = req.query.search as string | undefined;
    const includeInactive = req.query.includeInactive === "true";
    const parentId = config.parentField ? (req.query[config.parentField] as string | undefined) : undefined;

    const where: Record<string, unknown> = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      ...(config.parentField && parentId ? { [config.parentField]: parentId } : {}),
    };

    const data = await delegate.findMany({ where, orderBy: { name: "asc" } });
    sendList(res, data, data.length, 1, data.length || 1);
  }

  async function getOne(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const item = await delegate.findUnique({ where: { id } });
    if (!item) throw new ApiError(`${config.entityName} no encontrado`, 404, "CATALOG_ITEM_NOT_FOUND");
    sendItem(res, item);
  }

  async function create(req: Request, res: Response): Promise<void> {
    const { name } = req.body as { name: string };
    const data: Record<string, unknown> = { name };
    if (config.parentField && req.body[config.parentField] !== undefined) {
      data[config.parentField] = req.body[config.parentField];
    }
    const item = await delegate.create({ data });
    await createActivityLog({
      action: "CREATE", entityType: config.entityName, entityId: item.id as string,
      entityLabel: item.name as string, performedBy: req.user?.id
    });
    sendItem(res, item, 201);
  }

  async function update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) throw new ApiError(`${config.entityName} no encontrado`, 404, "CATALOG_ITEM_NOT_FOUND");

    const data: Record<string, unknown> = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.isActive !== undefined) data.isActive = req.body.isActive;
    if (config.parentField && req.body[config.parentField] !== undefined) {
      data[config.parentField] = req.body[config.parentField];
    }

    const item = await delegate.update({ where: { id }, data });
    await createActivityLog({
      action: "UPDATE", entityType: config.entityName, entityId: item.id as string,
      entityLabel: item.name as string, performedBy: req.user?.id
    });
    sendItem(res, item);
  }

  async function remove(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) throw new ApiError(`${config.entityName} no encontrado`, 404, "CATALOG_ITEM_NOT_FOUND");

    const item = await delegate.update({ where: { id }, data: { isActive: false } });
    await createActivityLog({
      action: "DELETE", entityType: config.entityName, entityId: item.id as string,
      entityLabel: item.name as string, performedBy: req.user?.id
    });
    sendItem(res, { ok: true, message: "Desactivado correctamente" });
  }

  return { list, getOne, create, update, remove };
}
