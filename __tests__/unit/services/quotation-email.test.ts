import { buildDefaultMessage, buildQuotationMessageEmail, messageToHtml, quotationTemplateVariables } from "../../../src/services/quotation-email";

jest.mock("../../../src/lib/prisma", () => ({ prisma: {} }));

const Q = { quotationNumber: "COTIZ-2026-10-0001", currency: "CLP", total: 321300, validUntil: "2026-12-31", request: { destinationCity: "París", destinationCountry: "Francia" } };
const AGENCY = { name: "Viajes Sur", email: "hola@viajessur.cl", phone: "+56 9 1111 2222" };

describe("mensaje inicial", () => {
  it("saluda por el nombre y nombra número, total y vigencia", () => {
    const text = buildDefaultMessage(Q, { firstName: "Ana" }, AGENCY);
    expect(text).toContain("Hola Ana,");
    expect(text).toContain("COTIZ-2026-10-0001");
    expect(text).toContain("CLP 321.300");
    expect(text).toContain("31/12/2026");
    expect(text.trimEnd().endsWith("Viajes Sur")).toBe(true);
  });
  it("sin total ni vigencia no inventa datos", () => {
    const text = buildDefaultMessage({ ...Q, total: null, validUntil: null }, { firstName: "Ana" }, AGENCY);
    expect(text).not.toMatch(/total de|válida hasta/);
  });
});

describe("variables de la plantilla", () => {
  it("rellena todas las variables que promete la plantilla 'Cotización enviada'", () => {
    expect(quotationTemplateVariables(Q, { firstName: "Ana" }, AGENCY)).toEqual({
      client_name: "Ana", quotation_number: "COTIZ-2026-10-0001", valid_until: "31/12/2026", destination: "París, Francia",
      total: "321.300", currency: "CLP", agency_name: "Viajes Sur", agency_email: "hola@viajessur.cl", agency_phone: "+56 9 1111 2222",
    });
  });
  it("las que no hay quedan vacías, no como 'undefined'", () => {
    const v = quotationTemplateVariables({ ...Q, request: null, validUntil: null }, { firstName: "Ana" }, { name: "X" });
    expect(v.destination).toBe("");
    expect(v.valid_until).toBe("");
    expect(v.agency_email).toBe("");
  });
});

describe("HTML del correo", () => {
  it("convierte el texto en párrafos y conserva los saltos simples", () => {
    expect(messageToHtml("Hola\nAna\n\nChao")).toBe(
      '<p style="margin:0 0 14px;line-height:1.6;">Hola<br>Ana</p><p style="margin:0 0 14px;line-height:1.6;">Chao</p>'
    );
  });
  it("escapa el HTML del mensaje: lo escrito por una persona nunca se interpreta", () => {
    const html = messageToHtml('<script>alert(1)</script> & "comillas"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
  it("el correo completo trae el mensaje, el resumen de la cotización y la agencia", () => {
    const html = buildQuotationMessageEmail("Hola Ana", Q, AGENCY);
    expect(html).toContain("Hola Ana");
    expect(html).toContain("COTIZ-2026-10-0001");
    expect(html).toContain("CLP 321.300");
    expect(html).toContain("31/12/2026");
    expect(html).toContain("Viajes Sur");
    expect(html).toContain("hola@viajessur.cl");
  });
  it("escapa también los datos de la agencia", () => {
    expect(buildQuotationMessageEmail("x", Q, { name: "A<b>B" })).toContain("A&lt;b&gt;B");
  });
});
