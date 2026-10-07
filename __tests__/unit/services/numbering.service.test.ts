jest.mock("../../../src/lib/prisma", () => ({ prisma: {} }));

import { nextSequence } from "../../../src/services/numbering.service";

const base = "COTIZ-2026-10-";

describe("nextSequence", () => {
  it("empieza en 1 sin registros previos", () => {
    expect(nextSequence([], base)).toBe(1);
  });

  it("continúa desde el mayor correlativo", () => {
    expect(nextSequence([`${base}0001`, `${base}0002`], base)).toBe(3);
  });

  // Regresión: con "cantidad + 1", borrar el 0001 de [0001, 0002, 0003] daba 0003, que ya existía.
  it("no repite un número cuando se borró uno anterior", () => {
    expect(nextSequence([`${base}0002`, `${base}0003`], base)).toBe(4);
  });

  it("ignora otros prefijos, otros meses y valores no numéricos", () => {
    expect(nextSequence(["PAG-2026-10-0009", "COTIZ-2026-09-0007", `${base}abc`, `${base}0002`], base)).toBe(3);
  });

  it("sigue contando correctamente pasando de 9999", () => {
    expect(nextSequence([`${base}9999`, `${base}10000`], base)).toBe(10001);
  });
});
