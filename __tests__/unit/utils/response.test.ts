import { sendItem, sendList, sendError } from "../../../src/utils/response";
import { ApiError } from "../../../src/utils/api-error";
import { createMockRes } from "../helpers/prisma-mock";

describe("response utils", () => {
  it("sendItem envuelve el dato en { data } con status 200 por defecto", () => {
    const res = createMockRes();
    sendItem(res, { id: "1" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { id: "1" } });
  });

  it("sendItem respeta un statusCode explícito (p.ej. 201 al crear)", () => {
    const res = createMockRes();
    sendItem(res, { id: "1" }, 201);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("sendList incluye data, total, page y limit", () => {
    const res = createMockRes();
    sendList(res, [{ id: "1" }], 1, 1, 20);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: "1" }], total: 1, page: 1, limit: 20 });
  });

  it("sendError devuelve { error, code } con el statusCode dado", () => {
    const res = createMockRes();
    sendError(res, "No encontrado", "NOT_FOUND", 404);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "No encontrado", code: "NOT_FOUND" });
  });
});

describe("ApiError", () => {
  it("usa statusCode 400 y code BAD_REQUEST por defecto", () => {
    const err = new ApiError("Algo salió mal");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("Algo salió mal");
  });

  it("permite un statusCode y code personalizados", () => {
    const err = new ApiError("Pago no encontrado", 404, "PAYMENT_NOT_FOUND");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("PAYMENT_NOT_FOUND");
  });
});
