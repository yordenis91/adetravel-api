// Correlativos con Postgres real: borrar un registro del mes no debe repetir un número existente.
jest.mock("../src/services/pdf.service", () => ({}));

const tag = `NUM${Date.now()}`;

describe("generateNumber (integración con Postgres)", () => {
  let prisma: any;
  let generateNumber: (entity: "Request", prefix: string) => Promise<string>;
  let clientId: string;

  beforeAll(async () => {
    ({ prisma } = require("../src/lib/prisma"));
    ({ generateNumber } = require("../src/services/numbering.service"));
    const client = await prisma.client.create({ data: { firstName: "Num", lastName: "Prueba" } });
    clientId = client.id;
  });

  afterAll(async () => {
    await prisma.request.deleteMany({ where: { clientId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.$disconnect();
  });

  it("continúa la secuencia y no repite un número tras borrar uno anterior", async () => {
    const created: string[] = [];
    for (let i = 0; i < 3; i++) {
      const requestNumber = await generateNumber("Request", tag);
      await prisma.request.create({ data: { requestNumber, clientId } });
      created.push(requestNumber);
    }
    expect(created.map((n) => n.slice(-4))).toEqual(["0001", "0002", "0003"]);

    await prisma.request.delete({ where: { requestNumber: created[0] } });

    const next = await generateNumber("Request", tag);
    expect(created).not.toContain(next);
    expect(next.slice(-4)).toBe("0004");
    await expect(prisma.request.create({ data: { requestNumber: next, clientId } })).resolves.toBeTruthy();
  });
});
