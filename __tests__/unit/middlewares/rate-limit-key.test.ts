process.env.JWT_SECRET = "una-clave-de-prueba-bastante-larga";
process.env.DATABASE_URL = "postgresql://x:x@localhost:5432/x_test";
process.env.PII_ENCRYPTION_KEY = "a".repeat(64);

import jwt from "jsonwebtoken";
import { apiRateLimitKey } from "../../../src/middlewares/rate-limit.middleware";

const reqWith = (authorization?: string, ip = "10.0.0.1") =>
  ({ headers: authorization ? { authorization } : {}, ip }) as any;

describe("apiRateLimitKey", () => {
  it("cuenta por usuario cuando el token es válido, aunque compartan IP", () => {
    const a = jwt.sign({ id: "u1" }, process.env.JWT_SECRET as string);
    const b = jwt.sign({ id: "u2" }, process.env.JWT_SECRET as string);
    expect(apiRateLimitKey(reqWith(`Bearer ${a}`))).toBe("user:u1");
    expect(apiRateLimitKey(reqWith(`Bearer ${b}`))).toBe("user:u2");
  });

  it("cae a la IP sin token o con un token inválido", () => {
    expect(apiRateLimitKey(reqWith())).toBe("ip:10.0.0.1");
    expect(apiRateLimitKey(reqWith("Bearer falso"))).toBe("ip:10.0.0.1");
    const forged = jwt.sign({ id: "u1" }, "otra-clave-distinta-0000000");
    expect(apiRateLimitKey(reqWith(`Bearer ${forged}`))).toBe("ip:10.0.0.1");
  });
});
