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
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  count: (args: unknown) => Promise<number>;
  updateMany: (args: unknown) => Promise<unknown>;
}

/** Catálogo hijo que depende de este (p.ej. ciudades y regiones de un país). */
interface CatalogChild {
  delegate: CatalogDelegate;
  /** Nombre plural para los mensajes ("ciudades"). */
  label: string;
  /** Singular ("ciudad"), para "1 ciudad". */
  singular: string;
  /** FK del hijo hacia este catálogo. */
  field: string;
}

interface CatalogConfig {
  entityName: string;
  /** Nombre del campo FK al catálogo padre (p.ej. "countryId" para City/Region). */
  parentField?: string;
  parentRequired?: boolean;
  /** Nombre para mensajes al usuario ("país", "ciudad"…). */
  displayName?: string;
  /** Delegado del catálogo padre (para no reactivar un hijo cuyo padre está desactivado). */
  parentDelegate?: CatalogDelegate;
  parentDisplayName?: string;
  children?: CatalogChild[];
}

/**
 * Factory de controlador CRUD genérico para nomencladores. Evita repetir 7 controladores
 * casi idénticos — cada catálogo comparte la misma forma { id, name, isActive, createdAt,
 * updatedAt } más, opcionalmente, una única FK al catálogo padre.
 */
export function createCatalogController(delegate: CatalogDelegate, config: CatalogConfig) {
  const noun = config.displayName ?? config.entityName;
  const cap = noun.charAt(0).toUpperCase() + noun.slice(1);

  /** Hijos activos que dependen de un registro, con su conteo. */
  async function activeDependents(id: string): Promise<{ label: string; singular: string; count: number }[]> {
    const rows = await Promise.all(
      (config.children ?? []).map(async (c) => ({
        label: c.label,
        singular: c.singular,
        count: await c.delegate.count({ where: { [c.field]: id, isActive: true } }),
      })),
    );
    return rows.filter((r) => r.count > 0);
  }

  const describe = (deps: { label: string; singular: string; count: number }[]) =>
    deps.map((d) => `${d.count} ${d.count === 1 ? d.singular : d.label}`).join(" y ");

  /** Rechaza un nombre repetido (sin distinguir mayúsculas) dentro del mismo padre, incluidos los
   * desactivados: antes el alta chocaba con la restricción única sin explicar que el registro
   * seguía existiendo, desactivado. */
  async function assertNotDuplicate(name: string, parentId: string | undefined, excludeId?: string): Promise<void> {
    const dup = await delegate.findFirst({
      where: {
        name: { equals: name.trim(), mode: "insensitive" },
        ...(config.parentField && parentId ? { [config.parentField]: parentId } : {}),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (!dup) return;
    if (dup.isActive === false) {
      throw new ApiError(
        `Ya existe ${noun} "${dup.name as string}" pero está desactivado. Reactívalo desde la lista (activa "Mostrar inactivos").`,
        409, "CATALOG_DUPLICATE_INACTIVE",
      );
    }
    throw new ApiError(`Ya existe ${noun} "${dup.name as string}".`, 409, "CATALOG_DUPLICATE");
  }

  async function dependents(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const existing = await delegate.findUnique({ where: { id } });
    if (!existing) throw new ApiError(`${cap} no encontrado`, 404, "CATALOG_ITEM_NOT_FOUND");
    const items = await activeDependents(id);
    sendItem(res, { total: items.reduce((n, d) => n + d.count, 0), items });
  }

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
    await assertNotDuplicate(name, config.parentField ? (req.body[config.parentField] as string | undefined) : undefined);
    const data: Record<string, unknown> = { name: name.trim() };
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
    if (req.body.name !== undefined) {
      const parentId = config.parentField
        ? ((req.body[config.parentField] as string | undefined) ?? (existing[config.parentField] as string))
        : undefined;
      await assertNotDuplicate(req.body.name as string, parentId, id);
      data.name = (req.body.name as string).trim();
    }
    if (req.body.isActive !== undefined) data.isActive = req.body.isActive;
    if (config.parentField && req.body[config.parentField] !== undefined) {
      data[config.parentField] = req.body[config.parentField];
    }

    // No se reactiva un hijo (ciudad, región, modelo) mientras su padre siga desactivado.
    if (req.body.isActive === true && existing.isActive === false && config.parentField && config.parentDelegate) {
      const parent = await config.parentDelegate.findUnique({ where: { id: existing[config.parentField] } });
      if (parent && parent.isActive === false) {
        throw new ApiError(
          `No se puede reactivar: ${config.parentDisplayName ?? "el padre"} "${parent.name as string}" está desactivado. Reactívalo primero.`,
          409, "CATALOG_PARENT_INACTIVE",
        );
      }
    }
    const cascade = req.query.cascade === "true";
    const reactivating = req.body.isActive === true && existing.isActive === false;

    const item = await delegate.update({ where: { id }, data });
    if (reactivating && cascade) {
      for (const c of config.children ?? []) await c.delegate.updateMany({ where: { [c.field]: id }, data: { isActive: true } });
    }
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

    const deps = await activeDependents(id);
    const cascade = req.query.cascade === "true";
    if (deps.length > 0 && !cascade) {
      throw new ApiError(
        `${cap} "${existing.name as string}" tiene ${describe(deps)} activas asociadas. Confirma para desactivarlas también.`,
        409, "CATALOG_HAS_DEPENDENTS",
      );
    }
    if (deps.length > 0) {
      for (const c of config.children ?? []) await c.delegate.updateMany({ where: { [c.field]: id }, data: { isActive: false } });
    }

    const item = await delegate.update({ where: { id }, data: { isActive: false } });
    await createActivityLog({
      action: "DELETE", entityType: config.entityName, entityId: item.id as string,
      entityLabel: item.name as string, performedBy: req.user?.id
    });
    sendItem(res, { ok: true, message: "Desactivado correctamente" });
  }

  return { list, getOne, create, update, remove, dependents };
}
