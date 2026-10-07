const mockPrisma = {
  rolePermission: { findMany: jest.fn() },
  userPermission: { findMany: jest.fn() },
};
jest.mock("../../../src/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  AGENCY_ROLE_PERMISSIONS,
  PERMISSIONS,
  applyUserOverrides,
  getEffectivePermissions,
  invalidateRolePermissionCache,
} from "../../../src/config/permissions";

const NOW = new Date("2026-10-07T12:00:00.000Z");
const PAST = new Date("2026-10-01T00:00:00.000Z");
const FUTURE = new Date("2026-11-01T00:00:00.000Z");

describe("applyUserOverrides", () => {
  const role = ["VIEW_REQUESTS", "MANAGE_SERVICES", "VIEW_LOGS"];

  it("sin excepciones devuelve los permisos del rol", () => {
    expect(applyUserOverrides(role, [], NOW).sort()).toEqual([...role].sort());
  });

  it("un effect desconocido falla cerrado: se trata como denegación", () => {
    const r = applyUserOverrides(role, [{ permission: "MANAGE_SERVICES", effect: "BLOCK" }], NOW);
    expect(r).not.toContain("MANAGE_SERVICES");
  });

  it("GRANT suma un permiso que el rol no tiene", () => {
    const r = applyUserOverrides(role, [{ permission: "VIEW_PAYMENTS", effect: "GRANT" }], NOW);
    expect(r).toContain("VIEW_PAYMENTS");
  });

  it("DENY quita un permiso heredado del rol y conserva el resto", () => {
    const r = applyUserOverrides(role, [{ permission: "MANAGE_SERVICES", effect: "DENY" }], NOW);
    expect(r).not.toContain("MANAGE_SERVICES");
    expect(r.sort()).toEqual(["VIEW_LOGS", "VIEW_REQUESTS"]);
  });

  it("DENY gana si el mismo permiso también llega como GRANT", () => {
    const r = applyUserOverrides(
      [],
      [
        { permission: "VIEW_PAYMENTS", effect: "GRANT" },
        { permission: "VIEW_PAYMENTS", effect: "DENY" },
      ],
      NOW
    );
    expect(r).not.toContain("VIEW_PAYMENTS");
  });

  it("una denegación vencida no aplica y una vigente sí", () => {
    const expired = applyUserOverrides(role, [{ permission: "VIEW_LOGS", effect: "DENY", expiresAt: PAST }], NOW);
    const active = applyUserOverrides(role, [{ permission: "VIEW_LOGS", effect: "DENY", expiresAt: FUTURE }], NOW);
    expect(expired).toContain("VIEW_LOGS");
    expect(active).not.toContain("VIEW_LOGS");
  });

  it("una excepción sin effect (filas anteriores a la migración) cuenta como GRANT", () => {
    const r = applyUserOverrides([], [{ permission: "VIEW_PAYMENTS" }], NOW);
    expect(r).toEqual(["VIEW_PAYMENTS"]);
  });

  it("no duplica permisos", () => {
    const r = applyUserOverrides(role, [{ permission: "VIEW_REQUESTS", effect: "GRANT" }], NOW);
    expect(r.filter((p) => p === "VIEW_REQUESTS")).toHaveLength(1);
  });
});

describe("getEffectivePermissions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateRolePermissionCache();
    mockPrisma.rolePermission.findMany.mockResolvedValue([]);
    mockPrisma.userPermission.findMany.mockResolvedValue([]);
  });

  it("un usuario OPERACIONES con MANAGE_SERVICES denegado pierde solo ese permiso", async () => {
    mockPrisma.userPermission.findMany.mockResolvedValue([{ permission: "MANAGE_SERVICES", effect: "DENY", expiresAt: null }]);
    const r = await getEffectivePermissions(mockPrisma as any, "u1", "USUARIO", "OPERACIONES");
    expect(r).not.toContain("MANAGE_SERVICES");
    const expected = AGENCY_ROLE_PERMISSIONS.OPERACIONES!.filter((p) => p !== "MANAGE_SERVICES");
    expect(r.sort()).toEqual([...expected].sort());
  });

  it("el administrador queda exento aunque exista una denegación", async () => {
    mockPrisma.userPermission.findMany.mockResolvedValue([{ permission: "MANAGE_USERS", effect: "DENY", expiresAt: null }]);
    const r = await getEffectivePermissions(mockPrisma as any, "a1", "ADMINISTRADOR", null);
    expect(r).toEqual(Object.values(PERMISSIONS));
    expect(mockPrisma.userPermission.findMany).not.toHaveBeenCalled();
  });

  it("sin rol de agencia, solo valen las excepciones", async () => {
    mockPrisma.userPermission.findMany.mockResolvedValue([
      { permission: "VIEW_REQUESTS", effect: "GRANT", expiresAt: null },
      { permission: "VIEW_LOGS", effect: "GRANT", expiresAt: null },
    ]);
    const r = await getEffectivePermissions(mockPrisma as any, "u2", "USUARIO", null);
    expect(r.sort()).toEqual(["VIEW_LOGS", "VIEW_REQUESTS"]);
  });
});
