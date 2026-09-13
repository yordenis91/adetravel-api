import { Request, Response } from "express";
import { createPrismaMock, createMockRes } from "../helpers/prisma-mock";

const mockPrisma = createPrismaMock();
const mockCreateActivityLog = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../src/lib/prisma", () => ({ prisma: mockPrisma }));
jest.mock("../../../src/services/activity-log.service", () => ({
  createActivityLog: mockCreateActivityLog,
}));

import {
  listClients,
  getClient,
  createClient,
  updateClient,
  toggleClientActive,
  deleteClient,
} from "../../../src/controllers/clients.controller";

const AUTH_USER = { id: "user-1", email: "admin@example.com", fullName: "Admin", role: "ADMINISTRADOR", agencyRole: null, isActive: true } as any;

function buildReq(overrides: Partial<Request> = {}): Request {
  return { query: {}, params: {}, body: {}, user: AUTH_USER, ...overrides } as unknown as Request;
}

describe("clients.controller (PII)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listClients", () => {
    it("busca por texto incluyendo el número de pasaporte (PII sensible en la búsqueda)", async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);
      const req = buildReq({ query: { search: "P1234567" } as any });

      await listClients(req, createMockRes());

      const args = mockPrisma.client.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual(
        expect.arrayContaining([expect.objectContaining({ passportNumber: expect.anything() })])
      );
    });

    it("filtra por isActive convirtiendo el string de query a boolean", async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);
      const req = buildReq({ query: { isActive: "false" } as any });

      await listClients(req, createMockRes());

      const args = mockPrisma.client.findMany.mock.calls[0][0];
      expect(args.where.isActive).toBe(false);
    });

    it("ignora un campo de orden (sort) no permitido y usa el default createdAt desc", async () => {
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.client.count.mockResolvedValue(0);
      const req = buildReq({ query: { sort: "passwordHash" } as any });

      await listClients(req, createMockRes());

      const args = mockPrisma.client.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ createdAt: "desc" });
    });
  });

  describe("getClient", () => {
    it("lanza 404 si el cliente no existe", async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);
      const res = createMockRes();

      await expect(getClient(buildReq({ params: { id: "x" } } as any), res)).rejects.toMatchObject({
        statusCode: 404,
        code: "CLIENT_NOT_FOUND",
      });
    });

    it("devuelve el cliente (incluyendo campos de PII) cuando existe", async () => {
      const client = { id: "c1", firstName: "Ana", passportNumber: "P1234567" };
      mockPrisma.client.findUnique.mockResolvedValue(client);
      const res = createMockRes();

      await getClient(buildReq({ params: { id: "c1" } } as any), res);

      expect(res.json).toHaveBeenCalledWith({ data: client });
    });
  });

  describe("createClient", () => {
    it("rechaza un RUT duplicado con 409 y no crea el cliente", async () => {
      mockPrisma.client.findFirst.mockResolvedValueOnce({ id: "existente" }); // check de rut
      const res = createMockRes();
      const req = buildReq({ body: { firstName: "Ana", lastName: "Pérez", rut: "11.111.111-1" } } as any);

      await expect(createClient(req, res)).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_RUT" });
      expect(mockPrisma.client.create).not.toHaveBeenCalled();
    });

    it("rechaza un email duplicado con 409 y no crea el cliente", async () => {
      // El body no trae rut, así que solo se dispara el findFirst del check de email.
      mockPrisma.client.findFirst.mockResolvedValueOnce({ id: "existente" });
      const res = createMockRes();
      const req = buildReq({
        body: { firstName: "Ana", lastName: "Pérez", email: "ana@example.com" },
      } as any);

      await expect(createClient(req, res)).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_EMAIL" });
      expect(mockPrisma.client.create).not.toHaveBeenCalled();
    });

    it("crea el cliente conservando los campos de PII (pasaporte y datos bancarios)", async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      const piiPayload = {
        firstName: "Ana",
        lastName: "Pérez",
        passportNumber: "P1234567",
        bankAccount: "0001234567",
        bankAccountHolder: "Ana Pérez",
      };
      mockPrisma.client.create.mockResolvedValue({ id: "c1", ...piiPayload });
      const res = createMockRes();
      const req = buildReq({ body: piiPayload } as any);

      await createClient(req, res);

      expect(mockPrisma.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passportNumber: "P1234567",
            bankAccount: "0001234567",
            bankAccountHolder: "Ana Pérez",
            createdBy: "user-1",
          }),
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockCreateActivityLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "CREATE", entityType: "Client" })
      );
    });
  });

  describe("updateClient", () => {
    it("lanza 404 si el cliente no existe", async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);
      const res = createMockRes();

      await expect(updateClient(buildReq({ params: { id: "x" } } as any), res)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("permite guardar el mismo RUT/email sin disparar el chequeo de duplicado", async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: "c1", rut: "11.111.111-1", email: "ana@example.com" });
      mockPrisma.client.update.mockResolvedValue({ id: "c1" });
      const res = createMockRes();
      const req = buildReq({
        params: { id: "c1" },
        body: { rut: "11.111.111-1", email: "ana@example.com" },
      } as any);

      await updateClient(req, res);

      expect(mockPrisma.client.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.client.update).toHaveBeenCalled();
    });

    it("rechaza cambiar a un RUT que ya pertenece a otro cliente", async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: "c1", rut: "11.111.111-1", email: null });
      mockPrisma.client.findFirst.mockResolvedValue({ id: "otro-cliente" });
      const res = createMockRes();
      const req = buildReq({ params: { id: "c1" }, body: { rut: "22.222.222-2" } } as any);

      await expect(updateClient(req, res)).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_RUT" });
      expect(mockPrisma.client.update).not.toHaveBeenCalled();
    });

    it("actualiza correctamente los campos de PII editados", async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: "c1", rut: null, email: null });
      mockPrisma.client.update.mockResolvedValue({ id: "c1", bankAccount: "9999999999" });
      const res = createMockRes();
      const req = buildReq({ params: { id: "c1" }, body: { bankAccount: "9999999999" } } as any);

      await updateClient(req, res);

      expect(mockPrisma.client.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { bankAccount: "9999999999" },
      });
    });
  });

  describe("toggleClientActive", () => {
    it("lanza 404 si el cliente no existe", async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);
      const res = createMockRes();

      await expect(
        toggleClientActive(buildReq({ params: { id: "x" } } as any), res)
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("invierte isActive (activo -> inactivo)", async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: "c1", firstName: "Ana", lastName: "Pérez", isActive: true });
      mockPrisma.client.update.mockResolvedValue({ id: "c1", isActive: false });
      const res = createMockRes();

      await toggleClientActive(buildReq({ params: { id: "c1" } } as any), res);

      expect(mockPrisma.client.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { isActive: false } });
    });
  });

  describe("deleteClient", () => {
    it("lanza 404 si el cliente no existe", async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);
      const res = createMockRes();

      await expect(deleteClient(buildReq({ params: { id: "x" } } as any), res)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("rechaza eliminar un cliente con solicitudes asociadas (protección de integridad)", async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: "c1", firstName: "Ana", lastName: "Pérez" });
      mockPrisma.request.count.mockResolvedValue(2);
      const res = createMockRes();

      await expect(deleteClient(buildReq({ params: { id: "c1" } } as any), res)).rejects.toMatchObject({
        statusCode: 409,
        code: "CLIENT_HAS_RELATIONS",
      });
      expect(mockPrisma.client.delete).not.toHaveBeenCalled();
    });

    it("elimina un cliente sin solicitudes asociadas", async () => {
      mockPrisma.client.findUnique.mockResolvedValue({ id: "c1", firstName: "Ana", lastName: "Pérez" });
      mockPrisma.request.count.mockResolvedValue(0);
      const res = createMockRes();

      await deleteClient(buildReq({ params: { id: "c1" } } as any), res);

      expect(mockPrisma.client.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
    });
  });
});
