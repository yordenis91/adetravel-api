// Contrato del API: la forma de las respuestas y las listas de valores que el cliente duplica.
//
// El archivo contracts/api-contract.json es la "instantánea" aceptada. Este test genera la forma actual
// con datos sembrados y la compara con ella. Si cambia una respuesta o una lista de valores, el test
// falla hasta que se actualice el contrato a propósito:
//
//     UPDATE_CONTRACT=1 npm run test:e2e
//
// y se revise el diff en el pull request. El cliente guarda una copia del contrato y su CI comprueba
// que sus constantes (estados del flujo, tipos de servicio, permisos) siguen coincidiendo con ella.
// Requiere Postgres migrado (npm run test:e2e).
process.env.RATE_LIMIT_MAX = "100000";
process.env.EMAIL_DELIVERY = "off";

jest.mock("../src/services/pdf.service", () => ({}));

import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { app } = require("../src/app");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { env } = require("../src/config/env");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../src/lib/prisma");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const prismaClient = require("@prisma/client");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WORKFLOW_STATUSES, VALID_TRANSITIONS } = require("../src/validators/workflow-status");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PERMISSIONS } = require("../src/config/permissions");

const CONTRACT_PATH = path.resolve(__dirname, "..", "contracts", "api-contract.json");
const UPDATE = process.env.UPDATE_CONTRACT === "1";
const tag = `ct${process.pid}${Date.now()}`;
const PASSWORD = "Contrato-2026!";

/** Campos cuyo contenido es libre (JSON): se documentan como "object"/"array" sin entrar en ellos. */
const OPAQUE_KEYS = new Set(["details", "items", "metadata", "serviceDetails"]);

type Shape = string | { [key: string]: Shape } | { $array: Shape };

const primitive = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);

function merge(a: Shape, b: Shape): Shape {
  if (JSON.stringify(a) === JSON.stringify(b)) return a;
  const isObj = (x: Shape): x is { [key: string]: Shape } => typeof x === "object" && !("$array" in x);
  const isArr = (x: Shape): x is { $array: Shape } => typeof x === "object" && "$array" in x;
  if (isObj(a) && isObj(b)) {
    const out: { [key: string]: Shape } = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      out[k] = k in a && k in b ? merge(a[k], b[k]) : (a[k] ?? b[k]);
    }
    return out;
  }
  if (isArr(a) && isArr(b)) return { $array: merge(a.$array, b.$array) };
  if (typeof a === "string" && typeof b === "string") return [...new Set([...a.split("|"), ...b.split("|")])].sort().join("|");
  return "mixed";
}

function shapeOf(value: unknown, key = "", depth = 0): Shape {
  if (OPAQUE_KEYS.has(key)) return primitive(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return { $array: "empty" };
    return { $array: value.map((v) => shapeOf(v, key, depth + 1)).reduce(merge) };
  }
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: Shape } = {};
    for (const k of Object.keys(value).sort()) out[k] = shapeOf((value as Record<string, unknown>)[k], k, depth + 1);
    return out;
  }
  return primitive(value);
}

/**
 * Endpoints que leen datos globales (la configuración de la agencia) que otras suites pueden rellenar
 * o vaciar en paralelo: sus campos de texto opcionales se documentan como "string|null", no según la
 * muestra de esta ejecución.
 */
function relaxNullableText(shape: Shape): Shape {
  if (typeof shape === "string") return shape === "null" || shape === "string" ? "null|string" : shape;
  if ("$array" in shape) return { $array: relaxNullableText(shape.$array) };
  return Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, relaxNullableText(v)]));
}
const RELAXED = new Set(["GET /system-config/agency"]);

describe("contrato del API (integración con Postgres)", () => {
  const rec: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  let admin: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const created: { model: string; id: string }[] = [];

  const auth = () => ({
    Authorization: `Bearer ${jwt.sign({ id: admin.id, email: admin.email, role: admin.role, tv: 0 }, env.JWT_SECRET)}`,
  });
  const make = async (model: string, data: Record<string, unknown>) => {
    const row = await (prisma as any)[model].create({ data }); // eslint-disable-line @typescript-eslint/no-explicit-any
    created.push({ model, id: row.id });
    return row;
  };

  beforeAll(async () => {
    admin = await make("user", {
      email: `${tag}-admin@example.com`, fullName: `Contrato ${tag}`, passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: "ADMINISTRADOR", agencyRole: "GERENTE", department: "Gerencia", phone: "+56 9 1111 2222",
    });
    rec.client = await make("client", {
      firstName: `Ana${tag}`, lastName: "Contrato", email: `${tag}@cliente.cl`, additionalEmails: ["extra@cliente.cl"], phone: "+56 9 5555 0000", rut: `${tag.slice(-8)}-1`,
      passportNumber: "P1234567", passportExpiry: "2030-01-01", passportIssueDate: "2020-01-01", passportCountry: "Chile",
      birthDate: "1990-05-05", nationality: "Chilena", address: "Calle 1", frequentFlyerNumbers: ["AA123"], restrictions: "Ninguna",
      referralSource: "Directo", bankAccount: "000111", bankName: "Banco", bankAccountHolder: "Ana", bankEmail: "ana@banco.cl", createdBy: admin.id,
    });
    rec.provider = await make("provider", {
      name: `Proveedor ${tag}`, fantasyName: "Fantasía", rut: "76.000.000-0", country: "Chile", city: "Santiago", address: "Av. 1", phone: "+56 2 2222 0000",
      email: `${tag}@prov.cl`, additionalEmails: ["extra@prov.cl"], businessType: "HOTEL", executiveName: "Eva", executivePhone: "+56 9 1", executiveEmail: "eva@prov.cl", contactName: "Pablo",
      contactPhone: "+56 9 2", contactEmail: "pablo@prov.cl", contactRut: "1-9", bankAccount: "999", bankName: "Banco", bankAccountHolder: "Prov",
      paymentMethod: "TRANSFERENCIA", vatPercentage: 19, createdBy: admin.id,
    });
    rec.request = await make("request", {
      requestNumber: `REQ-${tag}`, clientId: rec.client.id, requestDate: "2026-10-01", originCountry: "Chile", originCity: "Santiago",
      destinationCountry: "Perú", destinationCity: "Cusco", durationDays: 5, budgetMin: 1000, budgetMax: 2000, description: "Viaje", services: ["alojamiento"],
      cancellationReason: "motivo", createdBy: admin.id,
    });
    rec.service = await make("service", {
      serviceNumber: `SRV-${tag}`, requestId: rec.request.id, type: "ALOJAMIENTO", providerId: rec.provider.id, clientId: rec.client.id, price: 500,
      currency: "CLP", details: { hotel: "Andes" }, cancellationReason: "motivo", createdBy: admin.id,
    });
    rec.quotation = await make("quotation", {
      quotationNumber: `COT-${tag}`, requestId: rec.request.id, serviceId: rec.service.id, clientId: rec.client.id, validUntil: "2026-12-31",
      items: [{ service: "Hotel", quantity: 1, unitPrice: 500, total: 500 }], subtotal: 500, taxPercentage: 19, taxAmount: 95, discount: 0, total: 595,
      notes: "Notas", termsAndConditions: "Términos", createdBy: admin.id,
    });
    rec.confirmation = await make("confirmation", {
      confirmationNumber: `CNF-${tag}`, requestId: rec.request.id, serviceId: rec.service.id, providerId: rec.provider.id, providerConfirmationNumber: "XYZ",
      price: 500, validUntil: "2026-12-31", exchangeRate: 1, notes: "Notas", createdBy: admin.id,
    });
    rec.payment = await make("payment", {
      paymentNumber: `PAG-${tag}`, requestId: rec.request.id, quotationId: rec.quotation.id, clientId: rec.client.id, amount: 595, currency: "CLP",
      paymentDate: "2026-10-05", method: "TRANSFERENCIA", reference: `REF-${tag}`, notes: "Notas", createdBy: admin.id,
    });
    rec.voucher = await make("voucher", {
      voucherNumber: `VCH-${tag}`, requestId: rec.request.id, clientId: rec.client.id, providerId: rec.provider.id, serviceType: "ALOJAMIENTO",
      serviceName: "Hotel Andes", serviceDetails: "Detalle", checkIn: "2026-11-01", checkOut: "2026-11-05", destination: "Cusco",
      passengerNames: ["Ana Contrato"], confirmationCode: "ABC123", notes: "Notas", amount: 595, currency: "CLP", createdBy: admin.id,
    });
    rec.task = await make("task", {
      title: `Tarea ${tag}`, description: "Descripción", dueDate: "2026-12-31", priority: "MEDIA", userId: admin.id, createdBy: admin.id,
      relatedEntityType: "REQUEST", relatedEntityId: rec.request.id, relatedEntityLabel: `REQ-${tag}`,
    });
    rec.notification = await make("notification", { userId: admin.id, title: `Aviso ${tag}`, message: "Mensaje", type: "INFO", relatedEntityId: rec.request.id, relatedEntityType: "REQUEST" });
    rec.log = await make("activityLog", {
      action: "CREATE", entityType: "Request", entityId: rec.request.id, entityLabel: `REQ-${tag}`, description: "Creada", performedBy: admin.id, metadata: "{}",
    });
  });

  afterAll(async () => {
    for (const { model, id } of [...created].reverse()) {
      await (prisma as any)[model].deleteMany({ where: { id } }).catch(() => undefined); // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    await prisma.$disconnect();
  });

  const enums = () => ({
    workflowStatuses: [...WORKFLOW_STATUSES],
    validTransitions: VALID_TRANSITIONS,
    serviceTypes: Object.values(prismaClient.ServiceType),
    userRole: Object.values(prismaClient.UserRole),
    agencyRole: Object.values(prismaClient.AgencyRole),
    quotationStatus: Object.values(prismaClient.QuotationStatus),
    paymentStatus: Object.values(prismaClient.PaymentStatus),
    paymentMethod: Object.values(prismaClient.PaymentMethod),
    voucherStatus: Object.values(prismaClient.VoucherStatus),
    permissions: Object.values(PERMISSIONS).sort(),
  });

  const endpoints = (): { label: string; run: () => request.Test }[] => [
    { label: "POST /auth/login", run: () => request(app).post("/api/auth/login").send({ email: admin.email, password: PASSWORD }) },
    { label: "GET /auth/me", run: () => request(app).get("/api/auth/me").set(auth()) },
    { label: "GET /clients", run: () => request(app).get(`/api/clients?search=${tag}`).set(auth()) },
    { label: "GET /clients/:id", run: () => request(app).get(`/api/clients/${rec.client.id}`).set(auth()) },
    { label: "GET /providers", run: () => request(app).get(`/api/providers?search=${tag}`).set(auth()) },
    { label: "GET /requests", run: () => request(app).get(`/api/requests?search=${tag}`).set(auth()) },
    { label: "GET /requests/:id", run: () => request(app).get(`/api/requests/${rec.request.id}`).set(auth()) },
    { label: "GET /services", run: () => request(app).get(`/api/services?search=${tag}`).set(auth()) },
    { label: "GET /quotations", run: () => request(app).get(`/api/quotations?search=${tag}`).set(auth()) },
    { label: "GET /quotations/:id", run: () => request(app).get(`/api/quotations/${rec.quotation.id}`).set(auth()) },
    { label: "GET /confirmations", run: () => request(app).get(`/api/confirmations?search=${tag}`).set(auth()) },
    { label: "GET /payments", run: () => request(app).get(`/api/payments?search=${tag}`).set(auth()) },
    { label: "GET /vouchers", run: () => request(app).get(`/api/vouchers?search=${tag}`).set(auth()) },
    { label: "GET /users", run: () => request(app).get(`/api/users?search=${tag}`).set(auth()) },
    { label: "GET /tasks", run: () => request(app).get("/api/tasks").set(auth()) },
    { label: "GET /notifications", run: () => request(app).get("/api/notifications").set(auth()) },
    { label: "GET /activity-logs", run: () => request(app).get(`/api/activity-logs?entityId=${rec.request.id}`).set(auth()) },
    { label: "GET /search", run: () => request(app).get(`/api/search?q=${tag}`).set(auth()) },
    { label: "GET /system-config/agency", run: () => request(app).get("/api/system-config/agency").set(auth()) },
  ];

  it("la forma de las respuestas y las listas de valores coinciden con contracts/api-contract.json", async () => {
    const responses: Record<string, { status: number; body: Shape }> = {};
    for (const { label, run } of endpoints()) {
      const res = await run();
      const body = shapeOf(res.body);
      responses[label] = { status: res.status, body: RELAXED.has(label) ? relaxNullableText(body) : body };
    }
    const current = {
      version: 1,
      nota: "Generado por __tests__/api-contract.e2e.test.ts. No editar a mano: UPDATE_CONTRACT=1 npm run test:e2e",
      enums: JSON.parse(JSON.stringify(enums())),
      responses,
    };

    if (UPDATE) {
      fs.mkdirSync(path.dirname(CONTRACT_PATH), { recursive: true });
      fs.writeFileSync(CONTRACT_PATH, JSON.stringify(current, null, 2) + "\n");
      return;
    }

    expect(fs.existsSync(CONTRACT_PATH)).toBe(true);
    const accepted = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8"));
    // Mensaje claro si algo cambió: qué endpoints o listas difieren.
    const changed = [
      ...Object.keys(current.enums).filter((k) => JSON.stringify((current.enums as any)[k]) !== JSON.stringify(accepted.enums?.[k])).map((k) => `enums.${k}`), // eslint-disable-line @typescript-eslint/no-explicit-any
      ...[...new Set([...Object.keys(responses), ...Object.keys(accepted.responses ?? {})])]
        .filter((k) => JSON.stringify(responses[k]) !== JSON.stringify(accepted.responses?.[k])),
    ];
    if (changed.length) {
      throw new Error(
        `El contrato del API cambió en: ${changed.join(", ")}.\n` +
          "Si el cambio es intencionado, ejecuta UPDATE_CONTRACT=1 npm run test:e2e, revisa el diff de contracts/api-contract.json " +
          "y avisa al cliente (copia el contrato y ajusta lo que dependa de él)."
      );
    }
    expect(current).toEqual(accepted);
  });
});
