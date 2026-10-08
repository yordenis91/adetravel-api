import { createRequestSchema, updateRequestSchema } from "../../../src/validators/requests.validator";
import { createVoucherSchema } from "../../../src/validators/vouchers.validator";
import { SERVICE_TYPES as CATALOG_TYPES } from "../../../src/validators/services.validator";
import {
  LEGACY_SERVICE_TYPE_ALIASES,
  SERVICE_TYPE_LABELS,
  UNIFIED_SERVICE_TYPES,
  serviceTypeLabel,
} from "../../../src/validators/service-types";

describe("tipos de servicio unificados (D9)", () => {
  const base = { clientId: "c", destinationCountry: "Perú", destinationCity: "Cusco" };

  it("la lista unificada es el catálogo de servicios más OTRO, y todos tienen etiqueta", () => {
    expect(UNIFIED_SERVICE_TYPES).toEqual([...CATALOG_TYPES, "OTRO"]);
    expect(Object.keys(SERVICE_TYPE_LABELS).sort()).toEqual([...UNIFIED_SERVICE_TYPES].sort());
    for (const target of Object.values(LEGACY_SERVICE_TYPE_ALIASES)) expect(UNIFIED_SERVICE_TYPES).toContain(target);
  });

  it("la solicitud acepta valores antiguos, los convierte y quita duplicados", () => {
    const parsed = createRequestSchema.parse({ ...base, services: ["HOTEL", "AEREO", "ALOJAMIENTO", "VISA", "RENT_A_CAR"] });
    expect(parsed.services).toEqual(["ALOJAMIENTO", "PASAJE_AEREO", "VISA", "ARRIENDO_AUTO"]);
  });

  it("rechaza un tipo desconocido con un mensaje en español", () => {
    const res = createRequestSchema.safeParse({ ...base, services: ["SPA"] });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0].message).toBe("Tipo de servicio no válido");
  });

  it("un PATCH sin servicios no los toca", () => {
    expect(updateRequestSchema.parse({ description: "x" })).not.toHaveProperty("services");
  });

  it("el voucher convierte AÉREO, RESTAURANT y PAQUETE, y admite vacío", () => {
    const v = (serviceType: unknown) => createVoucherSchema.parse({ requestId: "r", serviceType }).serviceType;
    expect([v("AÉREO"), v("RESTAURANT"), v("PAQUETE"), v("CRUCERO"), v(null), v(undefined)]).toEqual([
      "PASAJE_AEREO", "OTRO", "OTRO", "CRUCERO", null, undefined,
    ]);
  });

  it("el PDF muestra el nombre en español, también para valores antiguos", () => {
    expect([serviceTypeLabel("PASAJE_AEREO"), serviceTypeLabel("HOTEL"), serviceTypeLabel(null), serviceTypeLabel("RARO")]).toEqual([
      "Pasaje aéreo", "Alojamiento", "", "RARO",
    ]);
  });
});
