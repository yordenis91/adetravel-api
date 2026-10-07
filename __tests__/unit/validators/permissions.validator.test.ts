import { grantUserPermissionSchema } from "../../../src/validators/permissions.validator";

describe("grantUserPermissionSchema", () => {
  it("sin effect se interpreta como GRANT (compatibilidad con clientes anteriores)", () => {
    expect(grantUserPermissionSchema.parse({ permission: "VIEW_LOGS" })).toEqual({ permission: "VIEW_LOGS", effect: "GRANT" });
  });

  it("acepta DENY", () => {
    expect(grantUserPermissionSchema.parse({ permission: "VIEW_LOGS", effect: "DENY" }).effect).toBe("DENY");
  });

  it("rechaza un effect desconocido o un permiso inexistente", () => {
    expect(grantUserPermissionSchema.safeParse({ permission: "VIEW_LOGS", effect: "BLOCK" }).success).toBe(false);
    expect(grantUserPermissionSchema.safeParse({ permission: "NO_EXISTE", effect: "DENY" }).success).toBe(false);
  });

  it("rechaza una denegación con expiración en el pasado, pero no un GRANT", () => {
    const past = "2020-01-01T00:00:00.000Z";
    expect(grantUserPermissionSchema.safeParse({ permission: "VIEW_LOGS", effect: "DENY", expiresAt: past }).success).toBe(false);
    expect(grantUserPermissionSchema.safeParse({ permission: "VIEW_LOGS", effect: "GRANT", expiresAt: past }).success).toBe(true);
    expect(grantUserPermissionSchema.safeParse({ permission: "VIEW_LOGS", effect: "DENY", expiresAt: "2999-01-01T00:00:00.000Z" }).success).toBe(true);
  });
});
