import { prisma } from "../src/lib/prisma";

/**
 * passportNumber y rut dentro de services.details quedan cifrados en la columna
 * y la API los devuelve descifrados (create, update, lectura y include).
 */
describe("Cifrado de PII en Service.details (e2e)", () => {
  let client: any;
  let request: any;
  let service: any;

  const details = {
    type: "SEGURO",
    fullName: "Persona Prueba",
    passportNumber: "P1122334",
    rut: "12.345.678-5",
    address: "Calle 1",
  };

  const rawDetails = async () =>
    (await prisma.$queryRaw<Array<{ details: Record<string, string> }>>`SELECT details FROM "services" WHERE id = ${service.id}`)[0].details;

  beforeAll(async () => {
    client = await prisma.client.create({ data: { firstName: "Svc", lastName: "PiiE2E" } });
    request = await prisma.request.create({ data: { requestNumber: `REQ-SPII-${process.pid}-${Date.now()}`, clientId: client.id } });
  });

  afterAll(async () => {
    if (service) await prisma.service.delete({ where: { id: service.id } }).catch(() => {});
    if (request) await prisma.request.delete({ where: { id: request.id } }).catch(() => {});
    if (client) await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("create devuelve texto plano y la columna guarda cifrado; el resto del JSON queda legible", async () => {
    service = await prisma.service.create({
      data: { serviceNumber: `SRV-SPII-${process.pid}-${Date.now()}`, requestId: request.id, type: "SEGURO", details } as any,
    });
    expect((service.details as any).passportNumber).toBe("P1122334");

    const raw = await rawDetails();
    expect(raw.passportNumber).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(raw.rut).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(raw.fullName).toBe("Persona Prueba");
  });

  it("findUnique y include descifran", async () => {
    const found = await prisma.service.findUnique({ where: { id: service.id } });
    expect((found!.details as any).rut).toBe("12.345.678-5");
    const viaRequest = await prisma.request.findUnique({ where: { id: request.id }, include: { servicesList: true } });
    expect((viaRequest!.servicesList[0].details as any).passportNumber).toBe("P1122334");
  });

  it("update re-cifra y no doble-cifra un valor ya cifrado", async () => {
    const updated = await prisma.service.update({
      where: { id: service.id },
      data: { details: { ...details, passportNumber: "P9999999" } } as any,
    });
    expect((updated.details as any).passportNumber).toBe("P9999999");
    expect((await rawDetails()).passportNumber).not.toBe("P9999999");
  });

  it("detalles sin esos campos (otros tipos) no se alteran", async () => {
    const updated = await prisma.service.update({
      where: { id: service.id },
      data: { details: { type: "SEGURO", fullName: "Sin Pasaporte" } } as any,
    });
    expect(updated.details).toEqual({ type: "SEGURO", fullName: "Sin Pasaporte" });
  });
});
