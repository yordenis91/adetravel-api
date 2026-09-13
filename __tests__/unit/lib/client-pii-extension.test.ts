import { clientPiiExtension } from "../../../src/lib/client-pii-extension";
import { decryptPII, isEncryptedPII } from "../../../src/lib/pii-encryption";

/**
 * Prueba la mitad de ESCRITURA de la extensión (query.client.*) invocando
 * directamente sus handlers con un `query` espía, sin necesitar un
 * PrismaClient real. La mitad de LECTURA (result.client.*, los campos
 * calculados) se prueba en el e2e contra Postgres real
 * (__tests__/client-pii-encryption.e2e.test.ts), porque depende del
 * mecanismo de "computed fields" de Prisma, no solo de estas funciones.
 */
describe("clientPiiExtension (escritura)", () => {
  function passthroughQuery() {
    return jest.fn(async (args: any) => args);
  }

  it("create: cifra passportNumber/bankAccount/bankAccountHolder en args.data", async () => {
    const query = passthroughQuery();
    const args = {
      data: {
        firstName: "Ana",
        lastName: "Pérez",
        passportNumber: "P1234567",
        bankAccount: "0001234567",
        bankAccountHolder: "Ana Pérez",
      },
    };

    await (clientPiiExtension.query.client.create as any)({ args, query });

    const sentData = query.mock.calls[0][0].data;
    expect(sentData.firstName).toBe("Ana"); // campos no sensibles intactos
    expect(isEncryptedPII(sentData.passportNumber)).toBe(true);
    expect(isEncryptedPII(sentData.bankAccount)).toBe(true);
    expect(isEncryptedPII(sentData.bankAccountHolder)).toBe(true);
    expect(decryptPII(sentData.passportNumber)).toBe("P1234567");
  });

  it("create: no rompe cuando los campos sensibles vienen undefined/ausentes", async () => {
    const query = passthroughQuery();
    const args = { data: { firstName: "Ana", lastName: "Pérez" } };

    await (clientPiiExtension.query.client.create as any)({ args, query });

    expect(query.mock.calls[0][0].data).toEqual({ firstName: "Ana", lastName: "Pérez" });
  });

  it("update: cifra los campos sensibles presentes en el payload de actualización", async () => {
    const query = passthroughQuery();
    const args = { where: { id: "c1" }, data: { bankAccount: "9999999999" } };

    await (clientPiiExtension.query.client.update as any)({ args, query });

    const sentData = query.mock.calls[0][0].data;
    expect(isEncryptedPII(sentData.bankAccount)).toBe(true);
    expect(decryptPII(sentData.bankAccount)).toBe("9999999999");
  });

  it("upsert: cifra tanto la rama create como la rama update", async () => {
    const query = passthroughQuery();
    const args = {
      where: { id: "c1" },
      create: { firstName: "Ana", lastName: "Pérez", passportNumber: "P1" },
      update: { passportNumber: "P2" },
    };

    await (clientPiiExtension.query.client.upsert as any)({ args, query });

    const sent = query.mock.calls[0][0];
    expect(decryptPII(sent.create.passportNumber)).toBe("P1");
    expect(decryptPII(sent.update.passportNumber)).toBe("P2");
  });

  it("createMany: cifra los campos sensibles de cada elemento del array", async () => {
    const query = passthroughQuery();
    const args = {
      data: [
        { firstName: "Ana", passportNumber: "P1" },
        { firstName: "Luis", passportNumber: "P2" },
      ],
    };

    await (clientPiiExtension.query.client.createMany as any)({ args, query });

    const sentData = query.mock.calls[0][0].data;
    expect(decryptPII(sentData[0].passportNumber)).toBe("P1");
    expect(decryptPII(sentData[1].passportNumber)).toBe("P2");
  });

  it("updateMany: cifra los campos sensibles del payload compartido", async () => {
    const query = passthroughQuery();
    const args = { where: { isActive: true }, data: { bankName: "Banco X", bankAccount: "111" } };

    await (clientPiiExtension.query.client.updateMany as any)({ args, query });

    const sentData = query.mock.calls[0][0].data;
    expect(sentData.bankName).toBe("Banco X"); // no está en la lista de campos cifrados
    expect(decryptPII(sentData.bankAccount)).toBe("111");
  });
});
