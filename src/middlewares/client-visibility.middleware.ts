import { NextFunction, Request, Response } from "express";
import { hasPermissionAsync } from "../config/permissions";
import { prisma } from "../lib/prisma";

/**
 * Varios endpoints (solicitudes, cotizaciones, pagos, vouchers, servicios) devuelven
 * el cliente incrustado bajo la clave `client` con TODOS sus campos (pasaporte, cuenta
 * bancaria, RUT...). Ese objeto solo debe verlo quien también puede ver el módulo de
 * clientes: dentro de otras respuestas se ve del cliente lo mismo que se vería en
 * /clients. Quien no tiene VIEW_CLIENTS (p.ej. el usuario de seguimiento automatizado)
 * recibe únicamente lo necesario para identificar de quién es el registro.
 *
 * Se hace sobre la respuesta, y no recortando cada consulta, porque varios
 * controllers usan el cliente completo por dentro (correos, PDF, validaciones) y
 * eso no debe cambiar. Así tampoco depende de acordarse en cada endpoint nuevo.
 */
const VISIBLE_CLIENT_FIELDS = ["id", "firstName", "lastName"] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** ¿Hay algún objeto `client` en la respuesta? Evita consultar permisos en las que no lo llevan. */
export function containsClient(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(containsClient);
  if (!isPlainObject(node)) return false;
  return Object.entries(node).some(([key, value]) => (key === "client" && isPlainObject(value)) || containsClient(value));
}

/** Copia de la respuesta donde cada `client` queda reducido a id, firstName y lastName. */
export function redactClients<T>(node: T): T {
  if (Array.isArray(node)) return node.map(redactClients) as unknown as T;
  if (!isPlainObject(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "client" && isPlainObject(value)) {
      out[key] = Object.fromEntries(VISIBLE_CLIENT_FIELDS.filter((f) => f in value).map((f) => [f, value[f]]));
    } else {
      out[key] = redactClients(value);
    }
  }
  return out as T;
}

/** Montar después de authMiddleware (necesita req.user). */
export function clientVisibility(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = ((body?: unknown) => {
    if (!containsClient(body)) return originalJson(body);

    const user = req.user;
    // Falla cerrado: si no se puede comprobar el permiso, se oculta.
    const check = user
      ? hasPermissionAsync(prisma, user.id, user.role, user.agencyRole, "VIEW_CLIENTS").catch(() => false)
      : Promise.resolve(false);

    check
      .then((allowed) => originalJson(allowed ? body : redactClients(body)))
      .catch(next);
    return res;
  }) as Response["json"];

  next();
}
