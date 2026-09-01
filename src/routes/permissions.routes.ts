import { Router } from "express";
import {
  getPermissionCatalog,
  listRoles,
  getRoleDetail,
  setRolePermissions,
  getUserPermissionsDetail,
  grantUserPermission,
  revokeUserPermission,
  listPermissionAudit,
} from "../controllers/permissions.controller";
import { asyncHandler } from "../utils/async-handler";
import { validate } from "../middlewares/validation.middleware";
import { requirePermission } from "../middlewares/permission.middleware";
import {
  setRolePermissionsSchema,
  grantUserPermissionSchema,
  userIdParamSchema,
  userPermissionParamSchema,
  listAuditSchema,
} from "../validators/permissions.validator";

export const permissionsRouter = Router();

// Todo este módulo requiere el permiso de administración de permisos
permissionsRouter.use(requirePermission("MANAGE_PERMISSIONS"));

permissionsRouter.get("/catalog", asyncHandler(getPermissionCatalog));

permissionsRouter.get("/roles", asyncHandler(listRoles));
permissionsRouter.get("/roles/:roleName", asyncHandler(getRoleDetail));
permissionsRouter.put(
  "/roles/:roleName",
  validate(setRolePermissionsSchema),
  asyncHandler(setRolePermissions)
);

permissionsRouter.get(
  "/users/:userId",
  validate(userIdParamSchema, "params"),
  asyncHandler(getUserPermissionsDetail)
);
permissionsRouter.post(
  "/users/:userId",
  validate(userIdParamSchema, "params"),
  validate(grantUserPermissionSchema),
  asyncHandler(grantUserPermission)
);
permissionsRouter.delete(
  "/users/:userId/:permission",
  validate(userPermissionParamSchema, "params"),
  asyncHandler(revokeUserPermission)
);

permissionsRouter.get(
  "/audit",
  validate(listAuditSchema, "query"),
  asyncHandler(listPermissionAudit)
);
