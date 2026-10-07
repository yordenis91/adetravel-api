import { weakJwtSecretReason } from "../../../src/config/env";

describe("weakJwtSecretReason", () => {
  it("avisa de un secreto corto o repetitivo", () => {
    expect(weakJwtSecretReason("corto-de-16-chars")).toMatch(/mínimo recomendado: 32/);
    expect(weakJwtSecretReason("a".repeat(40))).toMatch(/pocos caracteres distintos/);
  });

  it("acepta un secreto aleatorio de 32 bytes en hex", () => {
    expect(weakJwtSecretReason("3f9c1a7b5e2d8046c1b9e7a3d5f20864a7c3e1b9d5f20864a7c3e1b9d5f2086")).toBeNull();
  });
});
