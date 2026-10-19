jest.mock("../../../src/lib/prisma", () => ({ prisma: {} }));
jest.mock("../../../src/config/env", () => ({ env: { NODE_ENV: "test" } }));

import { fillTemplate } from "../../../src/services/email.service";
import { TEMPLATE_VARIABLES_MAP } from "../../../src/validators/email-templates.validator";
import {
  birthdayTemplateVariables, paymentTemplateVariables, requestTemplateVariables, voucherTemplateVariables,
} from "../../../src/services/email-template-variables";
import { DEFAULT_BIRTHDAY_HTML, DEFAULT_BIRTHDAY_SUBJECT } from "../../../src/services/birthday.service";

const agency = { name: "ADE Travel", email: "contacto@adetravel.cl", phone: null };
const client = { firstName: "María", lastName: "González" };

const built: Record<string, Record<string, string>> = {
  REQUEST_CREATED: requestTemplateVariables(
    { requestNumber: "ADET-2026-10-0001", requestDate: "2026-10-10", createdAt: new Date("2026-10-10T12:00:00Z"), destinationCity: "París", destinationCountry: "Francia" }, client, agency),
  PAYMENT_CONFIRMED: paymentTemplateVariables(
    { paymentNumber: "PAG-1", amount: 850000, currency: "CLP", paymentDate: "2026-10-15", method: "TRANSFERENCIA", reference: "REF-1", createdAt: new Date() }, client, agency),
  VOUCHER_ISSUED: voucherTemplateVariables(
    { voucherNumber: "VCH-1", serviceName: "Hotel Grand Palace", serviceType: "Hotel", destination: "París", checkIn: "2026-06-01", checkOut: "2026-06-08", confirmationCode: "CONF-1", passengerNames: ["María González", "Juan González"] }, client, agency),
  BIRTHDAY_GREETING: { ...birthdayTemplateVariables(client, agency), message: "Feliz día" },
};

describe("variables de las plantillas automáticas", () => {
  it.each(Object.keys(built))("%s: entrega exactamente las variables que la plantilla permite (ninguna sin rellenar)", (type) => {
    const allowed = TEMPLATE_VARIABLES_MAP[type].map((v) => v.name).sort();
    expect(Object.keys(built[type]).sort()).toEqual(allowed);
  });

  it("solicitud: nombre completo, destino y fecha en formato de Chile", () => {
    expect(built.REQUEST_CREATED).toMatchObject({ client_name: "María González", destination: "París, Francia", request_date: "10/10/2026", request_number: "ADET-2026-10-0001" });
  });

  it("pago: monto con formato, método legible y fecha de Chile", () => {
    expect(built.PAYMENT_CONFIRMED).toMatchObject({ amount: "850.000", payment_method: "Transferencia bancaria", payment_date: "15/10/2026", reference: "REF-1" });
  });

  it("voucher: pasajeros unidos, fechas de Chile y 'Pendiente' si no hay código", () => {
    expect(built.VOUCHER_ISSUED).toMatchObject({ passengers: "María González, Juan González", check_in: "01/06/2026", check_out: "08/06/2026" });
    expect(voucherTemplateVariables({ voucherNumber: "V" }, client, agency).confirmation_code).toBe("Pendiente");
  });

  it("un dato que falta va vacío, no undefined", () => {
    const v = voucherTemplateVariables({ voucherNumber: "V" }, client, agency);
    expect(Object.values(v).every((x) => typeof x === "string")).toBe(true);
    expect(v.destination).toBe("");
  });
});

describe("fillTemplate", () => {
  it("elimina las etiquetas que no tienen valor: nunca llega un {{...}} al cliente", () => {
    expect(fillTemplate("Hola {{client_name}}, {{inventada}} y {{ otra }}.", { client_name: "Ana" }, "html")).toBe("Hola Ana,  y .");
    expect(fillTemplate("Asunto {{client_name}} {{x}}", { client_name: "Ana" }, "text")).toBe("Asunto Ana ");
  });
  it("las variables HTML se insertan sin escapar; las demás sí", () => {
    expect(fillTemplate("{{a}}|{{b}}", { a: "<i>" }, "html", { b: "<p>ok</p>" })).toBe("&lt;i&gt;|<p>ok</p>");
  });
  it("las variables HTML no se usan en el asunto", () => {
    expect(fillTemplate("{{b}}", {}, "text", { b: "<p>x</p>" })).toBe("");
  });
});

describe("plantilla de cumpleaños por defecto", () => {
  it("solo usa variables permitidas para BIRTHDAY_GREETING", () => {
    const allowed = TEMPLATE_VARIABLES_MAP.BIRTHDAY_GREETING.map((v) => v.name);
    for (const text of [DEFAULT_BIRTHDAY_HTML, DEFAULT_BIRTHDAY_SUBJECT]) {
      const used = (text.match(/\{\{(\w+)\}\}/g) ?? []).map((m) => m.replace(/[{}]/g, ""));
      expect(used.length).toBeGreaterThan(0);
      expect(used.filter((u) => !allowed.includes(u))).toEqual([]);
    }
  });
});
