import { Request } from "express";
import { createMockRes } from "../helpers/prisma-mock";

const mockPrisma = {
  user: { findUnique: jest.fn() },
  userPermission: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
  rolePermission: { findMany: jest.fn() },
  permissionAudit: { create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock("../../../src/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  getUserPermissionsDetail,
  grantUserPermission,
  revokeUserPermission,
} from "../../../src/controllers/permissions.controller";
import { invalidateRolePermissionCache } from "../../../src/config/permissions";

const ME = { id: "admin-1", role: "ADMINISTRADOR" } as any;
const TARGET = "11111111-1111-4111-8111-111111111111";

const req = (overrides: Partial<Request>) =>
  ({ params: { userId: TARGET }, body: {}, query: {}, user: ME, ...overrides }) as unknown as Request;

const auditedActions = () => mockPrisma.permissionAudit.create.mock.calls.map((c) => c[0].data.action);

describe("permissions.controller (denegaciones por usuario)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateRolePermissionCache();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.rolePermission.findMany.mockResolvedValue([]);
    mockPrisma.userPermission.findMany.mockResolvedValue([]);
    mockPrisma.userPermission.findUnique.mockResolvedValue(null);
    mockPrisma.userPermission.upsert.mockImplementation(async ({ create }: any) => ({ id: "row-1", ...create }));
    mockPrisma.user.findUnique.mockResolvedValue({ id: TARGET, role: "USUARIO", agencyRole: "OPERACIONES" });
  });

  describe("grantUserPermission", () => {
    it("sin effect otorga (GRANT) y audita USER_PERMISSION_GRANTED", async () => {
      const res = createMockRes();
      await grantUserPermission(req({ body: { permission: "VIEW_PAYMENTS" } }), res);
      expect(mockPrisma.userPermission.upsert.mock.calls[0][0].create.effect).toBe("GRANT");
      expect(auditedActions()).toEqual(["USER_PERMISSION_GRANTED"]);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("con effect DENY guarda la denegación y audita USER_PERMISSION_DENIED", async () => {
      await grantUserPermission(req({ body: { permission: "MANAGE_SERVICES", effect: "DENY" } }), createMockRes());
      const call = mockPrisma.userPermission.upsert.mock.calls[0][0];
      expect(call.create).toMatchObject({ userId: TARGET, permission: "MANAGE_SERVICES", effect: "DENY", grantedBy: "admin-1" });
      expect(call.update.effect).toBe("DENY");
      expect(auditedActions()).toEqual(["USER_PERMISSION_DENIED"]);
    });

    it("no permite denegar a un administrador", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: TARGET, role: "ADMINISTRADOR", agencyRole: null });
      await expect(
        grantUserPermission(req({ body: { permission: "MANAGE_USERS", effect: "DENY" } }), createMockRes())
      ).rejects.toMatchObject({ statusCode: 400, code: "ADMIN_NOT_RESTRICTABLE" });
      expect(mockPrisma.userPermission.upsert).not.toHaveBeenCalled();
    });

    it("no permite denegarse permisos a uno mismo", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "gerente-1", role: "USUARIO", agencyRole: "GERENTE" });
      await expect(
        grantUserPermission(
          req({ params: { userId: "gerente-1" } as any, body: { permission: "MANAGE_PERMISSIONS", effect: "DENY" }, user: { id: "gerente-1", role: "USUARIO" } as any }),
          createMockRes()
        )
      ).rejects.toMatchObject({ statusCode: 400, code: "CANNOT_DENY_SELF" });
      expect(mockPrisma.userPermission.upsert).not.toHaveBeenCalled();
    });

    it("no permite que un usuario pise una denegación que se le aplicó", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "gerente-1", role: "USUARIO", agencyRole: "GERENTE" });
      mockPrisma.userPermission.findUnique.mockResolvedValue({ effect: "DENY" });
      await expect(
        grantUserPermission(
          req({ params: { userId: "gerente-1" } as any, body: { permission: "MANAGE_SERVICES" }, user: { id: "gerente-1", role: "USUARIO" } as any }),
          createMockRes()
        )
      ).rejects.toMatchObject({ statusCode: 403, code: "CANNOT_MODIFY_OWN_DENY" });
      expect(mockPrisma.userPermission.upsert).not.toHaveBeenCalled();
    });

    it("otorgar sobre una denegación existente la reemplaza y lo deja en la auditoría", async () => {
      mockPrisma.userPermission.findUnique.mockResolvedValue({ effect: "DENY" });
      await grantUserPermission(req({ body: { permission: "MANAGE_SERVICES" } }), createMockRes());
      expect(mockPrisma.userPermission.upsert.mock.calls[0][0].update.effect).toBe("GRANT");
      expect(mockPrisma.permissionAudit.create.mock.calls[0][0].data.metadata).toEqual({ replacedEffect: "DENY" });
    });

    it("404 si el usuario no existe", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        grantUserPermission(req({ body: { permission: "VIEW_LOGS", effect: "DENY" } }), createMockRes())
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe("revokeUserPermission", () => {
    const params = { userId: TARGET, permission: "MANAGE_SERVICES" } as any;

    it("quitar una denegación la restaura y audita USER_PERMISSION_DENY_REMOVED", async () => {
      mockPrisma.userPermission.findUnique.mockResolvedValue({ effect: "DENY" });
      await revokeUserPermission(req({ params }), createMockRes());
      expect(mockPrisma.userPermission.delete).toHaveBeenCalled();
      expect(auditedActions()).toEqual(["USER_PERMISSION_DENY_REMOVED"]);
    });

    it("no permite quitarse a uno mismo una denegación", async () => {
      mockPrisma.userPermission.findUnique.mockResolvedValue({ effect: "DENY" });
      await expect(
        revokeUserPermission(req({ params: { userId: "gerente-1", permission: "MANAGE_SERVICES" } as any, user: { id: "gerente-1", role: "USUARIO" } as any }), createMockRes())
      ).rejects.toMatchObject({ statusCode: 403, code: "CANNOT_MODIFY_OWN_DENY" });
      expect(mockPrisma.userPermission.delete).not.toHaveBeenCalled();
    });

    it("quitar una excepción otorgada sigue auditando USER_PERMISSION_REVOKED", async () => {
      mockPrisma.userPermission.findUnique.mockResolvedValue({ effect: "GRANT" });
      await revokeUserPermission(req({ params }), createMockRes());
      expect(auditedActions()).toEqual(["USER_PERMISSION_REVOKED"]);
    });

    it("404 si no hay excepción para ese permiso", async () => {
      await expect(revokeUserPermission(req({ params }), createMockRes())).rejects.toMatchObject({ statusCode: 404 });
      expect(mockPrisma.userPermission.delete).not.toHaveBeenCalled();
    });
  });

  describe("atomicidad", () => {
    it("si falla la auditoría la transacción se propaga como error (no queda cambio sin registro)", async () => {
      mockPrisma.permissionAudit.create.mockRejectedValueOnce(new Error("db"));
      await expect(
        grantUserPermission(req({ body: { permission: "MANAGE_SERVICES", effect: "DENY" } }), createMockRes())
      ).rejects.toThrow("db");
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("el audit de una revocación registra el efecto removido", async () => {
      mockPrisma.userPermission.findUnique.mockResolvedValue({ effect: "DENY", expiresAt: null });
      await revokeUserPermission(req({ params: { userId: TARGET, permission: "MANAGE_SERVICES" } as any }), createMockRes());
      expect(mockPrisma.permissionAudit.create.mock.calls[0][0].data.metadata).toMatchObject({ removedEffect: "DENY" });
    });
  });

  describe("getUserPermissionsDetail", () => {
    it("separa otorgados y denegados y excluye lo denegado de los efectivos", async () => {
      mockPrisma.userPermission.findMany.mockResolvedValue([
        { permission: "MANAGE_SERVICES", effect: "DENY", expiresAt: null },
        { permission: "VIEW_PAYMENTS", effect: "GRANT", expiresAt: null },
      ]);
      const res = createMockRes();
      await getUserPermissionsDetail(req({}), res);
      const body = res.json.mock.calls[0][0].data;
      expect(body.deniedPermissions.map((d: any) => d.permission)).toEqual(["MANAGE_SERVICES"]);
      expect(body.directGrants.map((d: any) => d.permission)).toEqual(["VIEW_PAYMENTS"]);
      expect(body.rolePermissions).toContain("MANAGE_SERVICES");
      expect(body.effectivePermissions).not.toContain("MANAGE_SERVICES");
      expect(body.effectivePermissions).toContain("VIEW_PAYMENTS");
    });

    it("una denegación vencida se lista pero no quita el permiso", async () => {
      mockPrisma.userPermission.findMany.mockResolvedValue([
        { permission: "MANAGE_SERVICES", effect: "DENY", expiresAt: new Date("2020-01-01T00:00:00Z") },
      ]);
      const res = createMockRes();
      await getUserPermissionsDetail(req({}), res);
      const body = res.json.mock.calls[0][0].data;
      expect(body.deniedPermissions).toHaveLength(1);
      expect(body.deniedPermissions[0].expired).toBe(true);
      expect(body.effectivePermissions).toContain("MANAGE_SERVICES");
    });
  });
});
