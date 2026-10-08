import { z } from "zod";
import { partialUpdate } from "../../../src/validators/partial-update";
import { createRequestSchema, updateRequestSchema } from "../../../src/validators/requests.validator";
import { updateServiceSchema } from "../../../src/validators/services.validator";
import { createPaymentSchema, updatePaymentSchema } from "../../../src/validators/payments.validator";
import { createClientSchema, updateClientSchema } from "../../../src/validators/clients.validator";
import { createTemplateSchema, updateTemplateSchema } from "../../../src/validators/email-templates.validator";

describe("partialUpdate", () => {
  const schema = z.object({ a: z.string().default("x"), b: z.boolean().optional().default(true), c: z.number() });

  it("no inyecta valores por defecto en un PATCH", () => {
    expect(partialUpdate(schema).parse({ c: 1 })).toEqual({ c: 1 });
    expect(partialUpdate(schema).parse({ b: false })).toEqual({ b: false });
  });

  it("sigue validando lo que sí viene", () => {
    expect(partialUpdate(schema).safeParse({ a: 3 }).success).toBe(false);
  });
});

// Cada PATCH real: lo que no se envía no debe aparecer en el resultado (si apareciera, el
// controlador lo escribiría en la base y sobrescribiría el valor guardado).
describe("esquemas de actualización sin valores por defecto", () => {
  it.each([
    ["solicitud", updateRequestSchema, { description: "nueva" }],
    ["servicio", updateServiceSchema, { price: 480 }],
    ["pago", updatePaymentSchema, { notes: "x" }],
    ["cliente", updateClientSchema, { phone: "+56 9 1111 1111" }],
    ["plantilla", updateTemplateSchema, { subject: "Hola" }],
  ])("%s: devuelve solo los campos enviados", (_name, s, body) => {
    expect((s as z.ZodTypeAny).parse(body)).toEqual(body);
    expect((s as z.ZodTypeAny).parse({})).toEqual({});
  });

  it("la creación conserva sus valores por defecto", () => {
    expect(createRequestSchema.parse({ clientId: "c", destinationCountry: "Perú", destinationCity: "Cusco" })).toMatchObject({ isPackage: false, services: [] });
    expect(createPaymentSchema.parse({ requestId: "r", amount: 10, method: "EFECTIVO" }).currency).toBe("CLP");
    expect(createClientSchema.parse({ firstName: "A", lastName: "B" })).toMatchObject({ isActive: true, frequentFlyerNumbers: [] });
    expect(createTemplateSchema.parse({ name: "n", type: "QUOTATION_SENT", subject: "s", bodyHtml: "<p/>" }).isActive).toBe(true);
  });
});
