import { z } from "zod";
import { Request, Response } from "express";
import { validate } from "../../../src/middlewares/validation.middleware";
import { createMockRes } from "../helpers/prisma-mock";

/**
 * Este archivo documenta y protege contra el patrón de bug que causó varias
 * fallas silenciosas en producción: `validate(schema)` reemplaza req.body por
 * el resultado de `schema.safeParse()`, así que cualquier campo NO declarado
 * en el schema desaparece silenciosamente antes de llegar al controller
 * (sin error visible en ningún lado). Ya pasó con updateMeSchema (cambio de
 * contraseña), updateUserSchema (reseteo de contraseña por admin) y
 * catalogSchema (reactivación de nomencladores).
 */
describe("validate() middleware", () => {
  function run(schema: z.ZodTypeAny, body: Record<string, unknown>) {
    const req = { body } as Request;
    const res = createMockRes();
    const next = jest.fn();
    validate(schema)(req, res as unknown as Response, next);
    return { req, res, next };
  }

  it("responde 400 y no llama next() cuando el payload es inválido", () => {
    const schema = z.object({ name: z.string().min(1) });
    const { res, next } = run(schema, { name: "" });

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VALIDATION_ERROR" })
    );
  });

  it("reemplaza req.body por los datos parseados y llama next() cuando es válido", () => {
    const schema = z.object({ name: z.string() });
    const { req, next } = run(schema, { name: "Ok" });

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ name: "Ok" });
  });

  it("DESCARTA silenciosamente cualquier campo no declarado en el schema (el patrón de bug real)", () => {
    const schema = z.object({ fullName: z.string() });
    const { req } = run(schema, {
      fullName: "Ana",
      currentPassword: "secreto123",
      newPassword: "nuevoSecreto123",
    });

    expect(req.body).toEqual({ fullName: "Ana" });
    expect(req.body).not.toHaveProperty("currentPassword");
    expect(req.body).not.toHaveProperty("newPassword");
  });

  it("con .passthrough() SÍ conserva los campos no declarados", () => {
    const schema = z.object({ fullName: z.string() }).passthrough();
    const { req } = run(schema, { fullName: "Ana", extra: "se mantiene" });

    expect(req.body).toEqual({ fullName: "Ana", extra: "se mantiene" });
  });
});
