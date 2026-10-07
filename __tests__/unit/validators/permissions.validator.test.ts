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
});
