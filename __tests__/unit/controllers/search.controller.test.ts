import { Request } from "express";
import { createMockRes } from "../helpers/prisma-mock";

const mockPrisma = {
  client: { findMany: jest.fn() },
  request: { findMany: jest.fn() },
  quotation: { findMany: jest.fn() },
  payment: { findMany: jest.fn() },
  voucher: { findMany: jest.fn() },
  userPermission: { findMany: jest.fn() },
  rolePermission: { findMany: jest.fn() },
};
jest.mock("../../../src/lib/prisma", () => ({ prisma: mockPrisma }));
// La coincidencia sin tildes es SQL crudo (se prueba en accent-search.test.ts y en el e2e): aquí solo importa a quién se consulta.
const mockIds = jest.fn();
jest.mock("../../../src/lib/accent-search", () => ({ idsMatchingSearch: (...args: unknown[]) => mockIds(...args) }));

import { globalSearch } from "../../../src/controllers/search.controller";
import { invalidateRolePermissionCache } from "../../../src/config/permissions";

const req = (user: any) => ({ query: { q: "abc" }, user }) as unknown as Request;

// globalSearch va envuelto en asyncHandler (devuelve void), así que se espera
// a que responda en vez de hacer await del handler.
const run = (user: any) =>
  new Promise<any>((resolve, reject) => {
    const res = createMockRes();
    res.json.mockImplementation((body: unknown) => resolve(body));
    globalSearch(req(user), res, reject);
  });

describe("globalSearch respeta los permisos VIEW_* del usuario", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIds.mockResolvedValue(["match-1"]);
    invalidateRolePermissionCache();
    mockPrisma.rolePermission.findMany.mockResolvedValue([]);
    mockPrisma.userPermission.findMany.mockResolvedValue([]);
    for (const model of ["client", "request", "quotation", "payment", "voucher"] as const) {
      mockPrisma[model].findMany.mockResolvedValue([{ id: `${model}-1` }]);
    }
  });

  it("sin rol de agencia ni permisos directos no consulta ninguna tabla", async () => {
    const body = await run({ id: "u1", role: "USUARIO", agencyRole: null });
    for (const model of ["client", "request", "quotation", "payment", "voucher"] as const) {
      expect(mockPrisma[model].findMany).not.toHaveBeenCalled();
    }
    expect(mockIds).not.toHaveBeenCalled();
    expect(body).toEqual({
      data: { clients: [], requests: [], quotations: [], payments: [], vouchers: [] },
    });
  });

  it("con solo VIEW_REQUESTS concedido consulta únicamente solicitudes", async () => {
    mockPrisma.userPermission.findMany.mockResolvedValue([{ permission: "VIEW_REQUESTS", effect: "GRANT" }]);
    const body = await run({ id: "u1", role: "USUARIO", agencyRole: null });
    expect(mockPrisma.request.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.request.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["match-1"] } });
    expect(mockIds).toHaveBeenCalledTimes(1);
    expect(mockIds).toHaveBeenCalledWith("requests", "abc", { limit: 5 });
    expect(mockPrisma.client.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.payment.findMany).not.toHaveBeenCalled();
    expect(body).toEqual({
      data: { clients: [], requests: [{ id: "request-1" }], quotations: [], payments: [], vouchers: [] },
    });
  });

  it("el ADMINISTRADOR busca en todas las tablas", async () => {
    await run({ id: "a1", role: "ADMINISTRADOR", agencyRole: null });
    for (const model of ["client", "request", "quotation", "payment", "voucher"] as const) {
      expect(mockPrisma[model].findMany).toHaveBeenCalledTimes(1);
    }
    // Clientes, solicitudes y vouchers buscan sin tildes; cotizaciones y pagos solo tienen números.
    expect(mockIds.mock.calls.map((c) => c[0])).toEqual(["clients", "requests", "vouchers"]);
  });

  it("la búsqueda global de clientes no incluye el teléfono ni el pasaporte", async () => {
    await run({ id: "a1", role: "ADMINISTRADOR", agencyRole: null });
    const clientCall = mockIds.mock.calls.find((c) => c[0] === "clients")!;
    expect(clientCall[2].columns).toEqual(["firstName", "lastName", "rut", "email"]);
  });
});
