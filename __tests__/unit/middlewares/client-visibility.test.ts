const mockHasPermissionAsync = jest.fn();
jest.mock("../../../src/lib/prisma", () => ({ prisma: {} }));
jest.mock("../../../src/config/permissions", () => ({ hasPermissionAsync: mockHasPermissionAsync }));

import express, { Request, Response } from "express";
import request from "supertest";
import {
  clientVisibility,
  containsClient,
  redactClients,
} from "../../../src/middlewares/client-visibility.middleware";

const FULL_CLIENT = {
  id: "c1",
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana@example.com",
  rut: "11.111.111-1",
  passportNumber: "P123456",
  bankAccount: "0001-2345",
  birthDate: "1990-01-01",
};
const MINIMAL_CLIENT = { id: "c1", firstName: "Ana", lastName: "Pérez" };

describe("redactClients", () => {
  it("reduce el cliente incrustado a id, firstName y lastName y conserva el resto", () => {
    const body = { data: { id: "r1", requestNumber: "SOL-1", client: FULL_CLIENT } };
    expect(redactClients(body)).toEqual({ data: { id: "r1", requestNumber: "SOL-1", client: MINIMAL_CLIENT } });
  });

  it("alcanza clientes dentro de listas y de objetos anidados", () => {
    const body = { data: [{ id: "p1", client: FULL_CLIENT }, { id: "p2", request: { id: "r1", client: FULL_CLIENT } }], total: 2 };
    expect(redactClients(body)).toEqual({
      data: [{ id: "p1", client: MINIMAL_CLIENT }, { id: "p2", request: { id: "r1", client: MINIMAL_CLIENT } }],
      total: 2,
    });
  });

  it("no muta el original (puede ser un objeto compartido) y respeta fechas", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const body = { data: { createdAt, client: { ...FULL_CLIENT } } };
    const out = redactClients(body);
    expect(body.data.client.passportNumber).toBe("P123456");
    expect(out.data.createdAt).toBe(createdAt);
  });

  it("deja intacta una respuesta sin cliente o con `client` nulo", () => {
    expect(redactClients({ data: { client: null, total: 3 } })).toEqual({ data: { client: null, total: 3 } });
  });
});

describe("containsClient", () => {
  it("detecta el cliente a cualquier profundidad", () => {
    expect(containsClient({ data: [{ request: { client: FULL_CLIENT } }] })).toBe(true);
    expect(containsClient({ data: { total: 1 } })).toBe(false);
    expect(containsClient(null)).toBe(false);
  });
});

describe("clientVisibility (middleware)", () => {
  const user = { id: "u1", role: "USUARIO", agencyRole: null };

  // Devuelve lo que finalmente se envió, esperando a que el middleware responda.
  const send = (body: unknown, reqUser: unknown = user) =>
    new Promise<{ sent: unknown; called: boolean }>((resolve, reject) => {
      const res: any = {};
      res.json = jest.fn((payload: unknown) => {
        resolve({ sent: payload, called: true });
        return res;
      });
      // next() sin argumentos es el paso normal; solo un next(error) debe fallar la prueba.
      clientVisibility({ user: reqUser } as unknown as Request, res as Response, (err?: unknown) => err && reject(err));
      (res.json as (b: unknown) => Response)(body);
    });

  beforeEach(() => jest.clearAllMocks());

  it("con VIEW_CLIENTS (p.ej. administrador) deja la respuesta tal cual", async () => {
    mockHasPermissionAsync.mockResolvedValue(true);
    const body = { data: { client: FULL_CLIENT } };
    expect((await send(body)).sent).toBe(body);
    expect(mockHasPermissionAsync.mock.calls[0][4]).toBe("VIEW_CLIENTS");
  });

  it("sin VIEW_CLIENTS entrega el cliente reducido", async () => {
    mockHasPermissionAsync.mockResolvedValue(false);
    expect((await send({ data: { client: FULL_CLIENT } })).sent).toEqual({ data: { client: MINIMAL_CLIENT } });
  });

  it("falla cerrado: si no puede comprobar el permiso, oculta los datos", async () => {
    mockHasPermissionAsync.mockRejectedValue(new Error("db caída"));
    expect((await send({ data: { client: FULL_CLIENT } })).sent).toEqual({ data: { client: MINIMAL_CLIENT } });
  });

  it("sin usuario autenticado también oculta", async () => {
    expect((await send({ data: { client: FULL_CLIENT } }, null)).sent).toEqual({ data: { client: MINIMAL_CLIENT } });
    expect(mockHasPermissionAsync).not.toHaveBeenCalled();
  });

  it("no consulta permisos cuando la respuesta no lleva cliente", async () => {
    const body = { data: [{ id: "x" }], total: 1 };
    expect((await send(body)).sent).toBe(body);
    expect(mockHasPermissionAsync).not.toHaveBeenCalled();
  });
});

describe("clientVisibility con Express real", () => {
  // Misma forma de responder que sendItem: res.status(...).json({ data }).
  const buildApp = () => {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: "u1", role: "USUARIO", agencyRole: null } as any;
      next();
    });
    app.use(clientVisibility);
    app.get("/con-cliente", (_req, res) => {
      res.status(201).json({ data: { id: "r1", client: FULL_CLIENT } });
    });
    app.get("/sin-cliente", (_req, res) => {
      res.json({ data: { id: "r1" } });
    });
    return app;
  };

  beforeEach(() => jest.clearAllMocks());

  it("sin VIEW_CLIENTS responde con el cliente reducido y conserva status y JSON", async () => {
    mockHasPermissionAsync.mockResolvedValue(false);
    const res = await request(buildApp()).get("/con-cliente");
    expect(res.status).toBe(201);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ data: { id: "r1", client: MINIMAL_CLIENT } });
    expect(JSON.stringify(res.body)).not.toMatch(/P123456|0001-2345|ana@example/);
  });

  it("con VIEW_CLIENTS responde el cliente completo", async () => {
    mockHasPermissionAsync.mockResolvedValue(true);
    const res = await request(buildApp()).get("/con-cliente");
    expect(res.body).toEqual({ data: { id: "r1", client: FULL_CLIENT } });
  });

  it("una respuesta sin cliente pasa sin consultar permisos", async () => {
    const res = await request(buildApp()).get("/sin-cliente");
    expect(res.body).toEqual({ data: { id: "r1" } });
    expect(mockHasPermissionAsync).not.toHaveBeenCalled();
  });
});
