// La migración unify_service_types (D9) convierte los tipos antiguos guardados en solicitudes y
// vouchers. Se vuelve a ejecutar su SQL sobre filas sembradas con valores antiguos (en la base de
// pruebas ya está aplicada por `prisma migrate deploy`): comprueba la conversión y que es idempotente.
import fs from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { LEGACY_SERVICE_TYPE_ALIASES } = require("../src/validators/service-types");

const MIGRATION = path.join(__dirname, "../prisma/migrations/20261008200000_unify_service_types/migration.sql");
const tag = `st-${Date.now()}`;

// Separa las sentencias del archivo (sin comentarios) para ejecutarlas una a una.
function statements(): string[] {
  const sql = fs.readFileSync(MIGRATION, "utf8").replace(/^\s*--.*$/gm, "");
  return sql.split(";").map((s) => s.trim()).filter(Boolean);
}

describe("migración de tipos de servicio unificados (integración con Postgres)", () => {
  let client: any;
  const requestIds: string[] = [];
  let voucherSeq = 0;

  beforeAll(async () => {
    client = await prisma.client.create({ data: { firstName: "Tipos", lastName: "Prueba", email: `${tag}@cliente.cl` } });
  });

  afterAll(async () => {
    await prisma.voucher.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.request.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.client.deleteMany({ where: { id: client?.id } });
    await prisma.$disconnect();
  });

  async function seedRequest(services: string[]) {
    const r = await prisma.request.create({
      data: { requestNumber: `${tag}-R${requestIds.length}`, clientId: client.id, services },
    });
    requestIds.push(r.id);
    return r.id;
  }

  async function seedVoucher(requestId: string, serviceType: string | null) {
    voucherSeq += 1;
    const v = await prisma.voucher.create({
      data: { voucherNumber: `${tag}-V${voucherSeq}`, requestId, clientId: client.id, serviceType },
    });
    return v.id;
  }

  it("convierte los valores antiguos, conserva el orden, quita duplicados y es idempotente", async () => {
    const mixed = await seedRequest(["HOTEL", "VISA", "AEREO", "ALOJAMIENTO", "TOUR"]);
    const untouched = await seedRequest(["SEGURO", "CRUCERO"]);
    const empty = await seedRequest([]);
    const vouchers: string[] = [];
    for (const t of [...Object.keys(LEGACY_SERVICE_TYPE_ALIASES), "CIRCUITO", null]) vouchers.push(await seedVoucher(untouched, t));

    for (let run = 0; run < 2; run++) {
      for (const sql of statements()) await prisma.$executeRawUnsafe(sql);

      const services = async (id: string) => (await prisma.request.findUnique({ where: { id } })).services;
      expect(await services(mixed)).toEqual(["ALOJAMIENTO", "VISA", "PASAJE_AEREO", "EXCURSION"]);
      expect(await services(untouched)).toEqual(["SEGURO", "CRUCERO"]);
      expect(await services(empty)).toEqual([]);

      const types = await Promise.all(
        vouchers.map(async (id) => (await prisma.voucher.findUnique({ where: { id } })).serviceType)
      );
      expect(types).toEqual([...Object.values(LEGACY_SERVICE_TYPE_ALIASES), "CIRCUITO", null]);
    }
  });
});
