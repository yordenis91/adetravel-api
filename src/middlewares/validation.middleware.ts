import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";
import { sendError } from "../utils/response";

export function validate(
  schema: ZodTypeAny,
  source: "body" | "query" | "params" = "body"
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      sendError(res, result.error.issues[0]?.message ?? "Payload inválido", "VALIDATION_ERROR", 400);
      return;
    }

    // CORRECCIÓN: Evita el error 'only a getter' mutando el objeto original para query y params
    if (source === "body") {
      req.body = result.data;
    } else {
      Object.assign(req[source], result.data);
    }
    
    next();
  };
}