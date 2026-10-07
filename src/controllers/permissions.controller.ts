import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem, sendList } from "../utils/response";
import { ApiError } from "../utils/api-error";
import { getPagination } from "../utils/pagination";
import {
  AGENCY_ROLE_NAMES,
  AGENCY_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_METADATA,
  Permission,
  applyUserOverrides,
  getEffectiveRolePermissions,
  invalidateRolePermissionCache,
} from "../config/permissions";

type DbClient = Pick<typeof prisma, "permissionAudit">;

async function auditPermissionChange(data: {
  action:
    | "ROLE_PERMISSIONS_UPDATED"
    | "USER_PERMISSION_GRANTED"
    | "USER_PERMISSION_REVOKED"
    | "USER_PERMISSION_DENIED"
    | "USER_PERMISSION_DENY_REMOVED";
  roleName?: string;
  targetUserId?: string;
  permission?: string;
  performedBy: string;
  metadata?: unknown;
}, db: DbClient = prisma): Promise<void> {
  await db.permissionAudit.create({
    data: {
      action: data.action,
      roleName: data.roleName,
      targetUserId: data.targetUserId,
      permission: data.permission,
      performedBy: data.performedBy,
      metadata: data.metadata as any,
    },
  });
}

export async function getPermissionCatalog(_req: Request, res: Response): Promise<void> {
  const catalog = Object.keys(PERMISSIONS).map((key) => ({
    name: key,
    module: PERMISSION_METADATA[key as Permission].module,
    description: PERMISSION_METADATA[key as Permission].description,
  }));
  sendItem(res, catalog);
}

export async function listRoles(_req: Request, res: Response): Promise<void> {
  const userCounts = await prisma.user.groupBy({
    by: ["agencyRole"],
    _count: { id: true },
    where: { agencyRole: { not: null } },
  });
  const countByRole = Object.fromEntries(userCounts.map((r) => [r.agencyRole, r._count.id]));

  const overrideRows = await prisma.rolePermission.findMany({ include: { role: true } });
  const customizedRoles = new Set(overrideRows.map((r) => r.role.name));

  const roles = await Promise.all(
    AGENCY_ROLE_NAMES.map(async (name) => ({
      name,
      permissions: await getEffectiveRolePermissions(prisma, name),
      isCustomized: customizedRoles.has(name),
      userCount: countByRole[name] ?? 0,
    }))
  );

  sendItem(res, roles);
}

export async function getRoleDetail(req: Request, res: Response): Promise<void> {
  const roleName = String(req.params.roleName).toUpperCase();
  if (!AGENCY_ROLE_NAMES.includes(roleName)) {
    throw new ApiError("Rol no encontrado", 404, "ROLE_NOT_FOUND");
  }

  const permissions = await getEffectiveRolePermissions(prisma, roleName);
  sendItem(res, { name: roleName, permissions, defaultPermissions: AGENCY_ROLE_PERMISSIONS[roleName] ?? [] });
}

export async function setRolePermissions(req: Request, res: Response): Promise<void> {
  const roleName = String(req.params.roleName).toUpperCase();
  if (!AGENCY_ROLE_NAMES.includes(roleName)) {
    throw new ApiError("Rol no encontrado", 404, "ROLE_NOT_FOUND");
  }

  const { permissions } = req.body as { permissions: Permission[] };

  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: {},
    create: { name: roleName },
  });

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
    prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permission })),
    }),
  ]);
  invalidateRolePermissionCache();

  await auditPermissionChange({
    action: "ROLE_PERMISSIONS_UPDATED",
    roleName,
    performedBy: req.user!.id,
    metadata: { permissions },
  });

  sendItem(res, { name: roleName, permissions });
}

export async function getUserPermissionsDetail(req: Request, res: Response): Promise<void> {
  const userId = String(req.params.userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError("Usuario no encontrado", 404, "USER_NOT_FOUND");

  const rolePermissions = user.agencyRole
    ? await getEffectiveRolePermissions(prisma, user.agencyRole)
    : [];

  const overrides = await prisma.userPermission.findMany({
    where: { userId },
    orderBy: { grantedAt: "desc" },
  });
  const now = new Date();
  const marked = overrides.map((o) => ({ ...o, expired: !!o.expiresAt && o.expiresAt <= now }));
  const directGrants = marked.filter((o) => o.effect !== "DENY");
  const deniedPermissions = marked.filter((o) => o.effect === "DENY");

  const effectivePermissions =
    user.role === "ADMINISTRADOR"
      ? Object.values(PERMISSIONS)
      : applyUserOverrides(rolePermissions, overrides, now);

  sendItem(res, {
    userId,
    systemRole: user.role,
    agencyRole: user.agencyRole,
    rolePermissions,
    directGrants,
    deniedPermissions,
    effectivePermissions,
  });
}

export async function grantUserPermission(req: Request, res: Response): Promise<void> {
  const userId = String(req.params.userId);
  const { permission, effect = "GRANT", expiresAt } = req.body as {
    permission: Permission;
    effect?: "GRANT" | "DENY";
    expiresAt?: string;
  };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError("Usuario no encontrado", 404, "USER_NOT_FOUND");

  if (effect === "DENY") {
    if (user.role === "ADMINISTRADOR") {
      throw new ApiError("Los administradores tienen acceso total y no admiten denegaciones", 400, "ADMIN_NOT_RESTRICTABLE");
    }
    if (userId === req.user!.id) {
      throw new ApiError("No puedes denegarte permisos a ti mismo", 400, "CANNOT_DENY_SELF");
    }
  }

  const row = await prisma.$transaction(async (tx) => {
    const previous = await tx.userPermission.findUnique({
      where: { userId_permission: { userId, permission } },
    });

    if (previous?.effect === "DENY" && userId === req.user!.id) {
      throw new ApiError("No puedes modificar una denegación que se te aplicó", 403, "CANNOT_MODIFY_OWN_DENY");
    }

    const data = {
      effect,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      grantedBy: req.user!.id,
      grantedAt: new Date(),
    };
    const saved = await tx.userPermission.upsert({
      where: { userId_permission: { userId, permission } },
      update: data,
      create: { userId, permission, ...data },
    });

    await auditPermissionChange({
      action: effect === "DENY" ? "USER_PERMISSION_DENIED" : "USER_PERMISSION_GRANTED",
      targetUserId: userId,
      permission,
      performedBy: req.user!.id,
      metadata: previous ? { replacedEffect: previous.effect } : undefined,
    }, tx);
    return saved;
  });

  sendItem(res, row, 201);
}

export async function revokeUserPermission(req: Request, res: Response): Promise<void> {
  const userId = String(req.params.userId);
  const permission = String(req.params.permission);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.userPermission.findUnique({
      where: { userId_permission: { userId, permission } },
    });
    if (!existing) throw new ApiError("El usuario no tiene una excepción para ese permiso", 404, "GRANT_NOT_FOUND");

    if (existing.effect === "DENY" && userId === req.user!.id) {
      throw new ApiError("No puedes quitarte una denegación que se te aplicó", 403, "CANNOT_MODIFY_OWN_DENY");
    }

    await tx.userPermission.delete({ where: { userId_permission: { userId, permission } } });

    await auditPermissionChange({
      action: existing.effect === "DENY" ? "USER_PERMISSION_DENY_REMOVED" : "USER_PERMISSION_REVOKED",
      targetUserId: userId,
      permission,
      performedBy: req.user!.id,
      metadata: { removedEffect: existing.effect, expiresAt: existing.expiresAt },
    }, tx);
  });

  sendItem(res, { ok: true });
}

export async function listPermissionAudit(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = getPagination(req.query);
  const { targetUserId, roleName } = req.query as { targetUserId?: string; roleName?: string };

  const where: any = {};
  if (targetUserId) where.targetUserId = targetUserId;
  if (roleName) where.roleName = roleName;

  const total = await prisma.permissionAudit.count({ where });
  const data = await prisma.permissionAudit.findMany({
    where,
    skip,
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  sendList(res, data, total, page, limit);
}
