import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem } from "../utils/response";
import { asyncHandler } from "../utils/async-handler";
import { getEffectivePermissions } from "../config/permissions";
import { idsMatchingSearch } from "../lib/accent-search";

export const globalSearch = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query.q as string;
  
  // Si la búsqueda es muy corta, devolvemos vacío para no forzar la BD
  if (!q || q.length < 2) {
    return sendItem(res, { clients: [], requests: [], quotations: [], payments: [], vouchers: [] });
  }

  // Cada grupo de resultados exige el mismo permiso VIEW_* que su listado: sin
  // esto, cualquier usuario autenticado podía leer clientes, pagos, etc. por
  // aquí aunque la API le negara esos módulos.
  const { id, role, agencyRole } = req.user!;
  const perms = new Set<string>(await getEffectivePermissions(prisma, id, role, agencyRole));
  const can = (permission: string) => perms.has(permission);

  // 🔥 La Magia: Buscamos en las 5 tablas EXACTAMENTE AL MISMO TIEMPO
  // Limitamos a 5 resultados por tabla (take: 5) para que el servidor ni se entere.
  const [clients, requests, quotations, payments, vouchers] = await Promise.all([
    // 1. Buscar Clientes
    !can("VIEW_CLIENTS") ? [] : prisma.client.findMany({
      where: { id: { in: await idsMatchingSearch("clients", q, { limit: 5, columns: ["firstName", "lastName", "rut", "email"] }) } },
      take: 5,
      select: { id: true, firstName: true, lastName: true, email: true, rut: true }
    }),
    
    // 2. Buscar Solicitudes
    !can("VIEW_REQUESTS") ? [] : prisma.request.findMany({
      where: { id: { in: await idsMatchingSearch("requests", q, { limit: 5 }) } },
      take: 5,
      select: { id: true, requestNumber: true, destinationCity: true, status: true }
    }),

    // 3. Buscar Cotizaciones
    !can("VIEW_QUOTATIONS") ? [] : prisma.quotation.findMany({
      where: { quotationNumber: { contains: q, mode: "insensitive" } },
      take: 5,
      select: { id: true, quotationNumber: true, total: true, currency: true, status: true }
    }),

    // 4. Buscar Pagos
    !can("VIEW_PAYMENTS") ? [] : prisma.payment.findMany({
      where: {
        OR: [
          { paymentNumber: { contains: q, mode: "insensitive" } },
          { reference: { contains: q, mode: "insensitive" } }
        ]
      },
      take: 5,
      select: { id: true, paymentNumber: true, amount: true, currency: true, status: true }
    }),

    // 5. Buscar Vouchers
    !can("VIEW_VOUCHERS") ? [] : prisma.voucher.findMany({
      where: { id: { in: await idsMatchingSearch("vouchers", q, { limit: 5, columns: ["voucherNumber", "serviceName", "confirmationCode"] }) } },
      take: 5,
      select: { id: true, voucherNumber: true, serviceName: true, confirmationCode: true }
    })
  ]);

  sendItem(res, { clients, requests, quotations, payments, vouchers });
});