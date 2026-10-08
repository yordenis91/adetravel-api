import fs from "fs";
import path from "path";
import { ENV_KEYS } from "../../../src/config/env";

// .env.example es la referencia de la lista de comprobación de salida (OPERATIONS.md): toda variable
// que valida src/config/env.ts debe aparecer, activa o comentada.
describe(".env.example", () => {
  it("documenta todas las variables que lee la API", () => {
    const example = fs.readFileSync(path.join(__dirname, "../../../.env.example"), "utf8");
    const documented = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]));
    expect(ENV_KEYS.filter((k) => !documented.has(k))).toEqual([]);
  });
});
