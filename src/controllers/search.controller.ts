import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { sendItem } from "../utils/response";
import { asyncHandler } from "../utils/async-handler";

export const globalSearch = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query.q as string;
  
  // Si la búsqueda es muy corta, devolvemos vacío para no forzar la BD
  if (!q || q.length < 2) {
    return sendItem(res, { clients: [], requests: [], quotations: [], payments: [], vouchers: [] });
  }

  // 🔥 La Magia: Buscamos en las 5 tablas EXACTAMENTE AL MISMO TIEMPO
  // Limitamos a 5 resultados por tabla (take: 5) para que el servidor ni se entere.
  const [clients, requests, quotations, payments, vouchers] = await Promise.all([
    // 1. Buscar Clientes
    prisma.client.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { rut: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } }
        ]
      },
      take: 5,
      select: { id: true, firstName: true, lastName: true, email: true, rut: true }
    }),
    
    // 2. Buscar Solicitudes
    prisma.request.findMany({
      where: {
        OR: [
          { requestNumber: { contains: q, mode: "insensitive" } },
          { destinationCity: { contains: q, mode: "insensitive" } },
          { originCity: { contains: q, mode: "insensitive" } }
        ]
      },
      take: 5,
      select: { id: true, requestNumber: true, destinationCity: true, status: true }
    }),

    // 3. Buscar Cotizaciones
    prisma.quotation.findMany({
      where: { quotationNumber: { contains: q, mode: "insensitive" } },
      take: 5,
      select: { id: true, quotationNumber: true, total: true, currency: true, status: true }
    }),

    // 4. Buscar Pagos
    prisma.payment.findMany({
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
    prisma.voucher.findMany({
      where: {
        OR: [
          { voucherNumber: { contains: q, mode: "insensitive" } },
          { serviceName: { contains: q, mode: "insensitive" } },
          { confirmationCode: { contains: q, mode: "insensitive" } }
        ]
      },
      take: 5,
      select: { id: true, voucherNumber: true, serviceName: true, confirmationCode: true }
    })
  ]);

  sendItem(res, { clients, requests, quotations, payments, vouchers });
});