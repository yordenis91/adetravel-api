import { z } from "zod";
import { PERMISSIONS } from "../config/permissions";

const PERMISSION_KEYS = Object.keys(PERMISSIONS) as [string, ...string[]];

export const permissionKeySchema = z.enum(PERMISSION_KEYS);

export const setRolePermissionsSchema = z.object({
  permissions: z.array(permissionKeySchema),
});

export const grantUserPermissionSchema = z.object({
  permission: permissionKeySchema,
  effect: z.enum(["GRANT", "DENY"]).default("GRANT"),
  expiresAt: z.string().datetime().optional(),
}).refine(
  (v) => v.effect !== "DENY" || !v.expiresAt || new Date(v.expiresAt) > new Date(),
  { message: "La fecha de expiración de una denegación debe ser futura", path: ["expiresAt"] }
);

export const userIdParamSchema = z.object({
  userId: z.string().uuid("ID de usuario inválido"),
});

export const userPermissionParamSchema = userIdParamSchema.extend({
  permission: permissionKeySchema,
});

export const listAuditSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  targetUserId: z.string().optional(),
  roleName: z.string().optional(),
});
