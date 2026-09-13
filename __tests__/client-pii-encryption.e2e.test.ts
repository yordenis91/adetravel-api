import { prisma } from "../src/lib/prisma";

/**
 * Prueba de extremo a extremo contra Postgres real: confirma que
 * passportNumber/bankAccount/bankAccountHolder quedan cifrados EN LA
 * COLUMNA (no solo "en la respuesta de la API"), y que la API sigue
 * devolviendo el valor descifrado de forma transparente — incluso cuando
 * el cliente se lee embebido vía `include` desde otro modelo (Payment),
 * que es exactamente el patrón que usan payments/vouchers/requests/
 * quotations/services en este backend.
 */
describe("Cifrado de PII de Cliente en reposo (e2e)", () => {
  let client: any;
  let request: any;
  let payment: any;

  const PLAINTEXT = {
    passportNumber: "P9988776",
    bankAccount: "0009988776",
    bankAccountHolder: "Cliente De Prueba",
  };

  afterAll(async () => {
    if (payment) await prisma.payment.delete({ where: { id: payment.id } }).catch(() => {});
    if (request) await prisma.request.delete({ where: { id: request.id } }).catch(() => {});
    if (client) await prisma.client.delete({ where: { id: client.id } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("crea un cliente y la API devuelve los valores en texto plano (transparente)", async () => {
    client = await prisma.client.create({
      data: {
        firstName: "PII",
        lastName: "TestE2E",
        ...PLAINTEXT,
      },
    });

    expect(client.passportNumber).toBe(PLAINTEXT.passportNumber);
    expect(client.bankAccount).toBe(PLAINTEXT.bankAccount);
    expect(client.bankAccountHolder).toBe(PLAINTEXT.bankAccountHolder);
  });

  it("la columna real en Postgres NO contiene el texto plano (consulta cruda, sin pasar por la extensión)", async () => {
    const rows = await prisma.$queryRaw<Array<Record<string, string | null>>>`
      SELECT "passportNumber", "bankAccount", "bankAccountHolder"
      FROM "clients"
      WHERE id = ${client.id}
    `;

    const raw = rows[0];
    expect(raw.passportNumber).not.toBe(PLAINTEXT.passportNumber);
    expect(raw.bankAccount).not.toBe(PLAINTEXT.bankAccount);
    expect(raw.bankAccountHolder).not.toBe(PLAINTEXT.bankAccountHolder);
    // Formato esperado: "v1:<iv>:<authTag>:<ciphertext>"
    expect(raw.passportNumber).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
  });

  it("findUnique directo descifra correctamente", async () => {
    const found = await prisma.client.findUnique({ where: { id: client.id } });
    expect(found?.passportNumber).toBe(PLAINTEXT.passportNumber);
    expect(found?.bankAccount).toBe(PLAINTEXT.bankAccount);
    expect(found?.bankAccountHolder).toBe(PLAINTEXT.bankAccountHolder);
  });

  it("update re-cifra el nuevo valor y lo descifra correctamente al leerlo", async () => {
    const updated = await prisma.client.update({
      where: { id: client.id },
      data: { bankAccount: "1112223334" },
    });
    expect(updated.bankAccount).toBe("1112223334");

    const rows = await prisma.$queryRaw<Array<Record<string, string | null>>>`
      SELECT "bankAccount" FROM "clients" WHERE id = ${client.id}
    `;
    expect(rows[0].bankAccount).not.toBe("1112223334");
  });

  it("un cliente embebido vía include (patrón usado por Payment/Voucher/Request/Quotation) también llega descifrado", async () => {
    request = await prisma.request.create({
      data: { requestNumber: `REQ-PII-${Date.now()}`, clientId: client.id },
    });
    payment = await prisma.payment.create({
      data: {
        paymentNumber: `PAG-PII-${Date.now()}`,
        requestId: request.id,
        clientId: client.id,
        amount: 100,
        currency: "CLP",
        method: "EFECTIVO",
        status: "PENDIENTE",
      },
      include: { client: true },
    });

    expect(payment.client.passportNumber).toBe(PLAINTEXT.passportNumber);
    expect(payment.client.bankAccountHolder).toBe(PLAINTEXT.bankAccountHolder);
  });

  it("un select parcial que no pide los campos sensibles no los expone", async () => {
    const partial = await prisma.client.findUnique({
      where: { id: client.id },
      select: { firstName: true, lastName: true },
    });
    expect(partial).not.toHaveProperty("passportNumber");
    expect(partial).not.toHaveProperty("bankAccount");
  });
});
