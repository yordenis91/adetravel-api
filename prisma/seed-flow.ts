import "dotenv/config";
import { Client, PaymentMethod, Provider, Quotation, Request, Service, ServiceType, WorkflowStatus } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { createActivityLog } from "../src/services/activity-log.service";
import { generateNumber } from "../src/services/numbering.service";
import { getAdminUser, daysAgo, daysFromNow, toDateInput } from "./seed-helpers";

/**
 * Seed del flujo completo de negocio: Solicitud → Servicio → Cotización → Confirmación → Pago →
 * Voucher, cubriendo los 17 estados de WorkflowStatus (+ Cancelada) para poder probar visualmente
 * cada estado, sus transiciones y sus cascadas Solicitud↔Servicio sin tener que recorrer el flujo
 * manualmente desde cero. Requiere que ya existan clientes/proveedores (seed-clients.ts,
 * seed-providers.ts) y opcionalmente los nomencladores (seed-catalogs.ts).
 *
 * Tres solicitudes quedan deliberadamente "atrasadas" (updatedAt > 24h) en los tres estados que
 * dispara el cron de notificaciones (ver src/jobs/overdueNotifications.job.ts), para poder probar
 * `POST /jobs/overdue-notifications/run` con datos reales apenas se corre este seed.
 */

async function main() {
  console.log("🌱 Iniciando seed del flujo de negocio (Solicitudes/Servicios/...)...");

  const admin = await getAdminUser();
  const config = await prisma.systemConfig.findFirst();
  const prefixes = {
    request: config?.requestNumberPrefix ?? "ADET",
    service: config?.serviceNumberPrefix ?? "SRV",
    quotation: config?.quotationNumberPrefix ?? "COTIZ",
    confirmation: config?.confirmationNumberPrefix ?? "CONF",
    payment: config?.paymentNumberPrefix ?? "PAG",
    voucher: config?.voucherNumberPrefix ?? "VCH",
  };

  const clients = await prisma.client.findMany({ orderBy: { createdAt: "asc" } });
  const providers = await prisma.provider.findMany({ orderBy: { createdAt: "asc" } });

  if (clients.length < 10 || providers.length < 7) {
    throw new Error(
      "Se necesitan al menos 10 clientes y 7 proveedores. Ejecuta primero: npm run seed:clients && npm run seed:providers"
    );
  }

  const providerByName = (partial: string): Provider => {
    const found = providers.find((p) => p.name.toUpperCase().includes(partial.toUpperCase()));
    if (!found) throw new Error(`No se encontró proveedor que contenga "${partial}"`);
    return found;
  };

  const hotelEnjoy = providerByName("ENJOY");
  const hertz = providerByName("HERTZ");
  const explora = providerByName("EXPLORA");
  const seguros = providerByName("SEGUROS FALABELLA");
  const latam = providerByName("LATAM");
  const traslados = providerByName("TRASLADOS");

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function createRequest(opts: {
    client: Client;
    isPackage?: boolean;
    /** Estado de la Solicitud. Debe reflejar el estado "burbujeado" del/los Servicio(s) que se
     * le agreguen a continuación (ver BUBBLE_UP_STATUSES en workflow-status.ts) — por defecto
     * RECEPCIONADA, que es el único estado que Prisma asignaría automáticamente. */
    status?: WorkflowStatus;
    originCountry?: string;
    originCity?: string;
    destinationCountry: string;
    destinationCity: string;
    durationDays?: number;
    budgetMin?: number;
    budgetMax?: number;
    description?: string;
    cancellationReason?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }): Promise<Request> {
    const requestNumber = await generateNumber("Request", prefixes.request);
    const req = await prisma.request.create({
      data: {
        requestNumber,
        clientId: opts.client.id,
        isPackage: opts.isPackage ?? false,
        requestDate: toDateInput(opts.createdAt ?? new Date()),
        originCountry: opts.originCountry ?? "Chile",
        originCity: opts.originCity ?? "Santiago",
        destinationCountry: opts.destinationCountry,
        destinationCity: opts.destinationCity,
        durationDays: opts.durationDays ?? 7,
        budgetMin: opts.budgetMin,
        budgetMax: opts.budgetMax,
        status: opts.status ?? "RECEPCIONADA",
        description: opts.description,
        cancellationReason: opts.cancellationReason,
        createdBy: admin.id,
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
        ...(opts.updatedAt ? { updatedAt: opts.updatedAt } : {}),
      },
    });
    await createActivityLog({
      action: "CREATE", entityType: "Request", entityId: req.id, entityLabel: req.requestNumber,
      description: `Solicitud creada (seed, estado ${opts.status})`, performedBy: admin.id,
    });
    return req;
  }

  async function createService(opts: {
    request: Request;
    type: ServiceType;
    status: WorkflowStatus;
    details: Record<string, unknown>;
    provider?: Provider | null;
    client?: Client | null;
    price?: number;
    cancellationReason?: string;
    updatedAt?: Date;
  }): Promise<Service> {
    const serviceNumber = await generateNumber("Service", prefixes.service);
    const svc = await prisma.service.create({
      data: {
        serviceNumber,
        requestId: opts.request.id,
        type: opts.type,
        status: opts.status,
        providerId: opts.provider?.id,
        clientId: opts.client?.id,
        price: opts.price,
        currency: "CLP",
        details: opts.details as never,
        cancellationReason: opts.cancellationReason,
        createdBy: admin.id,
        ...(opts.updatedAt ? { updatedAt: opts.updatedAt } : {}),
      },
    });
    await createActivityLog({
      action: "CREATE", entityType: "Service", entityId: svc.id, entityLabel: svc.serviceNumber,
      description: `Servicio ${opts.type} creado (seed, estado ${opts.status})`, performedBy: admin.id,
    });
    return svc;
  }

  async function createQuotation(opts: {
    request: Request;
    service?: Service | null;
    client: Client;
    status: "BORRADOR" | "ENVIADA" | "ACEPTADA" | "RECHAZADA";
    items: { service: string; description?: string; quantity: number; unitPrice: number; total: number }[];
  }): Promise<Quotation> {
    const quotationNumber = await generateNumber("Quotation", prefixes.quotation);
    const subtotal = opts.items.reduce((sum, i) => sum + i.total, 0);
    const taxPercentage = 19;
    const taxAmount = Math.round(subtotal * (taxPercentage / 100));
    const q = await prisma.quotation.create({
      data: {
        quotationNumber,
        requestId: opts.request.id,
        serviceId: opts.service?.id,
        clientId: opts.client.id,
        validUntil: toDateInput(daysFromNow(15)),
        status: opts.status,
        currency: "CLP",
        items: opts.items as never,
        subtotal, taxPercentage, taxAmount, discount: 0, total: subtotal + taxAmount,
        notes: config?.defaultQuotationNotes ?? undefined,
        termsAndConditions: config?.defaultTermsAndConditions ?? undefined,
        createdBy: admin.id,
      },
    });
    await createActivityLog({
      action: "CREATE", entityType: "Quotation", entityId: q.id, entityLabel: q.quotationNumber,
      description: `Cotización creada (seed, estado ${opts.status})`, performedBy: admin.id,
    });
    return q;
  }

  async function createConfirmation(opts: {
    request: Request; service?: Service | null; provider: Provider; price: number; providerConfirmationNumber?: string;
  }) {
    const confirmationNumber = await generateNumber("Confirmation", prefixes.confirmation);
    const c = await prisma.confirmation.create({
      data: {
        confirmationNumber,
        requestId: opts.request.id,
        serviceId: opts.service?.id,
        providerId: opts.provider.id,
        providerConfirmationNumber: opts.providerConfirmationNumber,
        price: opts.price,
        validUntil: toDateInput(daysFromNow(30)),
        createdBy: admin.id,
      },
    });
    await createActivityLog({
      action: "CREATE", entityType: "Confirmation", entityId: c.id, entityLabel: c.confirmationNumber,
      description: "Confirmación de proveedor registrada (seed)", performedBy: admin.id,
    });
    return c;
  }

  async function createPayment(opts: {
    request: Request; quotation?: Quotation | null; client: Client; amount: number;
    status: "PENDIENTE" | "COMPLETADO" | "CANCELADO"; method?: PaymentMethod;
  }) {
    const paymentNumber = await generateNumber("Payment", prefixes.payment);
    const p = await prisma.payment.create({
      data: {
        paymentNumber,
        requestId: opts.request.id,
        quotationId: opts.quotation?.id,
        clientId: opts.client.id,
        amount: opts.amount,
        currency: "CLP",
        method: opts.method ?? "TRANSFERENCIA",
        status: opts.status,
        paymentDate: opts.status === "COMPLETADO" ? toDateInput(new Date()) : undefined,
        reference: opts.status === "COMPLETADO" ? `TRF-${Math.floor(100000 + Math.random() * 900000)}` : undefined,
        createdBy: admin.id,
      },
    });
    await createActivityLog({
      action: "CREATE", entityType: "Payment", entityId: p.id, entityLabel: p.paymentNumber,
      description: `Pago registrado (seed, estado ${opts.status})`, performedBy: admin.id,
    });
    return p;
  }

  async function createVoucher(opts: {
    request: Request; client: Client; provider?: Provider | null; status: "BORRADOR" | "EMITIDO" | "CANCELADO";
    serviceType?: string; serviceName?: string; destination?: string; checkIn?: string; checkOut?: string; amount?: number;
  }) {
    const voucherNumber = await generateNumber("Voucher", prefixes.voucher);
    const v = await prisma.voucher.create({
      data: {
        voucherNumber,
        requestId: opts.request.id,
        clientId: opts.client.id,
        providerId: opts.provider?.id,
        serviceType: opts.serviceType,
        serviceName: opts.serviceName,
        destination: opts.destination,
        checkIn: opts.checkIn,
        checkOut: opts.checkOut,
        passengerNames: [`${opts.client.firstName} ${opts.client.lastName}`],
        confirmationCode: `CNF${Math.floor(10000 + Math.random() * 90000)}`,
        status: opts.status,
        amount: opts.amount,
        currency: "CLP",
        createdBy: admin.id,
      },
    });
    await createActivityLog({
      action: "CREATE", entityType: "Voucher", entityId: v.id, entityLabel: v.voucherNumber,
      description: `Voucher ${opts.status} (seed)`, performedBy: admin.id,
    });
    return v;
  }

  // ── Escenarios (uno por cada uno de los 17 estados + Cancelada) ─────────────

  // 1. RECEPCIONADA — recién ingresada, sin proveedor asignado todavía.
  const req1 = await createRequest({
    client: clients[0], destinationCountry: "México", destinationCity: "Cancún",
    durationDays: 7, budgetMin: 1500000, budgetMax: 2200000,
    description: "Luna de miel, hotel todo incluido frente al mar.",
  });
  await createService({
    request: req1, type: "ALOJAMIENTO", status: "RECEPCIONADA",
    details: { type: "ALOJAMIENTO", roomCount: 1, rooms: [{ responsibleName: `${clients[0].firstName} ${clients[0].lastName}`, roomType: "DOBLE" }], checkIn: toDateInput(daysFromNow(60)), checkOut: toDateInput(daysFromNow(67)), hotelName: "Grand Riviera Maya", hotelCity: "Cancún", hotelCountry: "México", hotelChain: "Grand Resorts", starRating: 5 },
  });

  // 2. ENVIADO_A_PROVEEDOR — servicio ya asignado y enviado a cotizar con el proveedor.
  const req2 = await createRequest({
    client: clients[1], destinationCountry: "Argentina", destinationCity: "Buenos Aires",
    durationDays: 5, budgetMin: 600000, budgetMax: 900000, description: "Viaje de negocios, pasaje ida y vuelta.",
    status: "ENVIADO_A_PROVEEDOR",
  });
  await createService({
    request: req2, type: "PASAJE_AEREO", status: "ENVIADO_A_PROVEEDOR", provider: latam,
    details: { type: "PASAJE_AEREO", fullName: `${clients[1].firstName} ${clients[1].lastName}`, origin: "Santiago", destination: "Buenos Aires", departureDate: toDateInput(daysFromNow(20)), returnDate: toDateInput(daysFromNow(25)), passportNumber: clients[1].passportNumber ?? undefined, rut: clients[1].rut ?? undefined },
  });

  // 3. COTIZADO_POR_ADETRAVEL — el servicio ya tiene precio final de la agencia, con Cotización BORRADOR.
  const req3 = await createRequest({
    client: clients[2], destinationCountry: "Perú", destinationCity: "Lima",
    durationDays: 6, budgetMin: 700000, budgetMax: 1000000, description: "Tour cultural con excursión a Machu Picchu.",
    status: "COTIZADO_POR_ADETRAVEL",
  });
  const svc3 = await createService({
    request: req3, type: "EXCURSION", status: "COTIZADO_POR_ADETRAVEL", provider: explora, price: 320000,
    details: { type: "EXCURSION", clientName: `${clients[2].firstName} ${clients[2].lastName}`, startDateTime: `${toDateInput(daysFromNow(30))}T08:00`, excursionName: "Machu Picchu Full Day", adultsCount: 2, childrenCount: 0 },
  });
  await createQuotation({
    request: req3, service: svc3, client: clients[2], status: "BORRADOR",
    items: [{ service: "Excursión Machu Picchu Full Day", description: "2 adultos, incluye guía y almuerzo", quantity: 2, unitPrice: 160000, total: 320000 }],
  });

  // 4. ENVIADO_AL_CLIENTE — oferta enviada, esperando aceptación. Se deja "atrasada" (>24h) para
  //    poder probar la notificación de "pendiente de aceptación por el cliente" (doc 6.12).
  const req4 = await createRequest({
    client: clients[3], destinationCountry: "Colombia", destinationCity: "Cartagena",
    durationDays: 5, budgetMin: 900000, budgetMax: 1300000, description: "Escapada de fin de semana largo.",
    status: "ENVIADO_AL_CLIENTE", updatedAt: daysAgo(2),
  });
  const svc4 = await createService({
    request: req4, type: "ALOJAMIENTO", status: "ENVIADO_AL_CLIENTE", provider: hotelEnjoy, price: 480000, updatedAt: daysAgo(2),
    details: { type: "ALOJAMIENTO", roomCount: 1, rooms: [{ responsibleName: `${clients[3].firstName} ${clients[3].lastName}`, roomType: "DOBLE" }], checkIn: toDateInput(daysFromNow(15)), checkOut: toDateInput(daysFromNow(20)), hotelName: "Hotel Enjoy Cartagena", hotelCity: "Cartagena", hotelCountry: "Colombia", hotelChain: "Enjoy", starRating: 4 },
  });
  await createQuotation({
    request: req4, service: svc4, client: clients[3], status: "ENVIADA",
    items: [{ service: "Alojamiento Hotel Enjoy Cartagena", description: "5 noches, habitación doble", quantity: 5, unitPrice: 96000, total: 480000 }],
  });

  // 5. ACEPTADA_POR_CLIENTE — el cliente ya aceptó la oferta.
  const req5 = await createRequest({
    client: clients[4], destinationCountry: "Uruguay", destinationCity: "Montevideo",
    durationDays: 8, budgetMin: 1800000, budgetMax: 2500000, description: "Crucero por el Río de la Plata.",
    status: "ACEPTADA_POR_CLIENTE",
  });
  const svc5 = await createService({
    request: req5, type: "CRUCERO", status: "ACEPTADA_POR_CLIENTE", price: 2100000,
    details: { type: "CRUCERO", clientName: `${clients[4].firstName} ${clients[4].lastName}`, cruiseName: "MSC Río de la Plata", cabinType: "EXTERNA", cabinCount: 1, passengerCount: 2, route: "Montevideo - Punta del Este - Buenos Aires" },
  });
  await createQuotation({
    request: req5, service: svc5, client: clients[4], status: "ACEPTADA",
    items: [{ service: "Crucero MSC Río de la Plata", description: "Cabina externa, 2 pasajeros", quantity: 1, unitPrice: 2100000, total: 2100000 }],
  });

  // 6. ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR — esperando que el proveedor confirme la reserva.
  //    También "atrasada" (>24h) para probar la notificación de confirmación pendiente.
  const req6 = await createRequest({
    client: clients[5], destinationCountry: "Argentina", destinationCity: "Bariloche",
    durationDays: 6, budgetMin: 400000, budgetMax: 600000, description: "Arriendo de auto para recorrer la Patagonia.",
    status: "ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR", updatedAt: daysAgo(2),
  });
  await createService({
    request: req6, type: "ARRIENDO_AUTO", status: "ENVIADA_SOLICITUD_CONFIRMACION_PROVEEDOR", provider: hertz, price: 350000, updatedAt: daysAgo(2),
    details: { type: "ARRIENDO_AUTO", clientName: `${clients[5].firstName} ${clients[5].lastName}`, pickupDate: toDateInput(daysFromNow(25)), pickupTime: "10:00", dropoffDate: toDateInput(daysFromNow(31)), dropoffTime: "10:00", pickupAddress: "Aeropuerto de Bariloche", dropoffAddress: "Aeropuerto de Bariloche", carType: "SUV", carBrand: "Toyota", carModel: "RAV4", unlimitedMileage: true },
  });

  // 7. CONFIRMADA_POR_PROVEEDOR — el proveedor ya confirmó, con su número de confirmación.
  const req7 = await createRequest({
    client: clients[6], destinationCountry: "Chile", destinationCity: "Pucón",
    durationDays: 10, budgetMin: 100000, budgetMax: 200000, description: "Seguro de asistencia en viaje para vacaciones familiares.",
    status: "CONFIRMADA_POR_PROVEEDOR",
  });
  const svc7 = await createService({
    request: req7, type: "SEGURO", status: "CONFIRMADA_POR_PROVEEDOR", provider: seguros, price: 150000,
    details: { type: "SEGURO", fullName: `${clients[6].firstName} ${clients[6].lastName}`, address: clients[6].address ?? "Sin dirección registrada", birthDate: clients[6].birthDate ?? "1975-01-01", phone: clients[6].phone ?? "+56 9 0000 0000", tripStartDate: toDateInput(daysFromNow(10)), tripEndDate: toDateInput(daysFromNow(20)), emergencyContactName: "Contacto de Emergencia", emergencyContactPhone: "+56 9 1111 2222", planType: "Plan Oro Internacional" },
  });
  await createConfirmation({ request: req7, service: svc7, provider: seguros, price: 150000, providerConfirmationNumber: "SF-2026-88451" });

  // 8. ENVIADA_SOLICITUD_PAGO_CLIENTE — confirmado, esperando que el cliente pague. También
  //    "atrasada" (>24h) para probar la notificación de pago pendiente.
  const req8 = await createRequest({
    client: clients[7], destinationCountry: "México", destinationCity: "Cancún",
    durationDays: 7, budgetMin: 1200000, budgetMax: 1600000, description: "Vacaciones familiares, hotel todo incluido.",
    status: "ENVIADA_SOLICITUD_PAGO_CLIENTE", updatedAt: daysAgo(2),
  });
  const svc8 = await createService({
    request: req8, type: "ALOJAMIENTO", status: "ENVIADA_SOLICITUD_PAGO_CLIENTE", provider: hotelEnjoy, price: 1400000, updatedAt: daysAgo(2),
    details: { type: "ALOJAMIENTO", roomCount: 2, rooms: [{ responsibleName: `${clients[7].firstName} ${clients[7].lastName}`, roomType: "FAMILIAR" }, { responsibleName: `${clients[7].firstName} ${clients[7].lastName}`, roomType: "DOBLE" }], checkIn: toDateInput(daysFromNow(45)), checkOut: toDateInput(daysFromNow(52)), hotelName: "Grand Riviera Maya", hotelCity: "Cancún", hotelCountry: "México", hotelChain: "Grand Resorts", starRating: 5 },
  });
  await createConfirmation({ request: req8, service: svc8, provider: hotelEnjoy, price: 1400000, providerConfirmationNumber: "GRM-556231" });

  // 9. PAGADO_POR_CLIENTE — el cliente ya pagó, falta pagar al proveedor.
  const req9 = await createRequest({
    client: clients[8], destinationCountry: "Argentina", destinationCity: "Buenos Aires",
    durationDays: 4, budgetMin: 500000, budgetMax: 700000, description: "Viaje corto de negocios.",
    status: "PAGADO_POR_CLIENTE",
  });
  const svc9 = await createService({
    request: req9, type: "PASAJE_AEREO", status: "PAGADO_POR_CLIENTE", provider: latam, price: 620000,
    details: { type: "PASAJE_AEREO", fullName: `${clients[8].firstName} ${clients[8].lastName}`, origin: "Santiago", destination: "Buenos Aires", departureDate: toDateInput(daysFromNow(12)), returnDate: toDateInput(daysFromNow(16)), passportNumber: clients[8].passportNumber ?? undefined, rut: clients[8].rut ?? undefined },
  });
  const quot9 = await createQuotation({
    request: req9, service: svc9, client: clients[8], status: "ACEPTADA",
    items: [{ service: "Pasaje aéreo Santiago - Buenos Aires", quantity: 1, unitPrice: 620000, total: 620000 }],
  });
  await createConfirmation({ request: req9, service: svc9, provider: latam, price: 620000, providerConfirmationNumber: "LA-9945102" });
  await createPayment({ request: req9, quotation: quot9, client: clients[8], amount: 620000, status: "COMPLETADO" });

  // 10. VENDIDA — Solicitud tipo Paquete completa: 2 servicios, ambos ya en Vendida (cascada de
  //     Paquete: todo se gestiona a nivel Solicitud, ver regla de negocio #5).
  const req10 = await createRequest({
    client: clients[9], isPackage: true, destinationCountry: "México", destinationCity: "Cancún",
    durationDays: 7, budgetMin: 2000000, budgetMax: 2800000, description: "Paquete luna de miel: vuelo + hotel.",
    status: "VENDIDA",
  });
  const svc10a = await createService({
    request: req10, type: "ALOJAMIENTO", status: "VENDIDA", provider: hotelEnjoy, price: 1500000,
    details: { type: "ALOJAMIENTO", roomCount: 1, rooms: [{ responsibleName: `${clients[9].firstName} ${clients[9].lastName}`, roomType: "DOBLE" }], checkIn: toDateInput(daysFromNow(40)), checkOut: toDateInput(daysFromNow(47)), hotelName: "Grand Riviera Maya", hotelCity: "Cancún", hotelCountry: "México", hotelChain: "Grand Resorts", starRating: 5 },
  });
  await createService({
    request: req10, type: "PASAJE_AEREO", status: "VENDIDA", provider: latam, price: 780000, client: clients[9],
    details: { type: "PASAJE_AEREO", fullName: `${clients[9].firstName} ${clients[9].lastName}`, origin: "Santiago", destination: "Cancún", departureDate: toDateInput(daysFromNow(40)), returnDate: toDateInput(daysFromNow(47)), passportNumber: clients[9].passportNumber ?? undefined, rut: clients[9].rut ?? undefined },
  });
  const quot10 = await createQuotation({
    request: req10, client: clients[9], status: "ACEPTADA",
    items: [
      { service: "Alojamiento Grand Riviera Maya", quantity: 7, unitPrice: 214286, total: 1500000 },
      { service: "Pasaje aéreo Santiago - Cancún", quantity: 1, unitPrice: 780000, total: 780000 },
    ],
  });
  await createConfirmation({ request: req10, provider: hotelEnjoy, price: 2280000, providerConfirmationNumber: "PKG-2026-001" });
  const pay10 = await createPayment({ request: req10, quotation: quot10, client: clients[9], amount: 2280000, status: "COMPLETADO" });
  void pay10;
  await createVoucher({ request: req10, client: clients[9], provider: hotelEnjoy, status: "EMITIDO", serviceType: "PAQUETE", serviceName: "Cancún todo incluido", destination: "Cancún, México", checkIn: toDateInput(daysFromNow(40)), checkOut: toDateInput(daysFromNow(47)), amount: 2280000 });

  // 11. CANCELADA — el cliente desistió del viaje (regla de negocio #12: motivo obligatorio).
  const req11 = await createRequest({
    client: clients[0], destinationCountry: "República Dominicana", destinationCity: "Punta Cana",
    durationDays: 7, budgetMin: 1600000, budgetMax: 2000000, description: "Vacaciones familiares.",
    status: "CANCELADA", cancellationReason: "El cliente desistió del viaje por motivos personales y solicitó anular la solicitud.",
  });
  await createService({
    request: req11, type: "ALOJAMIENTO", status: "CANCELADA",
    cancellationReason: "Solicitud cancelada por el cliente.",
    details: { type: "ALOJAMIENTO", roomCount: 1, rooms: [{ responsibleName: `${clients[0].firstName} ${clients[0].lastName}`, roomType: "FAMILIAR" }], checkIn: toDateInput(daysFromNow(50)), checkOut: toDateInput(daysFromNow(57)), hotelName: "Hard Rock Punta Cana", hotelCity: "Punta Cana", hotelCountry: "República Dominicana", hotelChain: "Hard Rock", starRating: 5 },
  });

  // ── Cobertura de los estados restantes (sin sub-entidades adicionales, solo para poder ver
  //    cada estado en la pantalla de Solicitudes/Servicios) ────────────────────────────────

  // 12. SERVICIOS_ASIGNADOS_PARA_COTIZAR
  const req12 = await createRequest({ client: clients[1], destinationCountry: "España", destinationCity: "Madrid", durationDays: 12, description: "Visa Schengen para viaje de estudios.", status: "SERVICIOS_ASIGNADOS_PARA_COTIZAR" });
  await createService({
    request: req12, type: "VISA", status: "SERVICIOS_ASIGNADOS_PARA_COTIZAR",
    details: { type: "VISA", fullName: `${clients[1].firstName} ${clients[1].lastName}`, passportNumber: clients[1].passportNumber ?? "N/A", birthDate: clients[1].birthDate ?? "1985-01-01", nationality: clients[1].nationality ?? "Chilena" },
  });

  // 13. COTIZADO_POR_PROVEEDOR
  const req13 = await createRequest({ client: clients[2], destinationCountry: "Chile", destinationCity: "Puerto Varas", durationDays: 3, description: "Traslados aeropuerto - hotel.", status: "COTIZADO_POR_PROVEEDOR" });
  await createService({
    request: req13, type: "TRASLADO", status: "COTIZADO_POR_PROVEEDOR", provider: traslados, price: 85000,
    details: { type: "TRASLADO", clientName: `${clients[2].firstName} ${clients[2].lastName}`, startDateTime: `${toDateInput(daysFromNow(18))}T14:00`, originAddress: "Aeropuerto El Tepual, Puerto Montt", destinationAddress: "Hotel Cumbres Puerto Varas", adultsCount: 2, childrenCount: 0, infantsCount: 0 },
  });

  // 14. VOUCHER_EMITIDO
  const req14 = await createRequest({ client: clients[3], destinationCountry: "Perú", destinationCity: "Cusco", durationDays: 9, description: "Circuito arqueológico por el Valle Sagrado.", status: "VOUCHER_EMITIDO" });
  const svc14 = await createService({
    request: req14, type: "CIRCUITO", status: "VOUCHER_EMITIDO", provider: explora, price: 950000,
    details: { type: "CIRCUITO", clientName: `${clients[3].firstName} ${clients[3].lastName}`, circuitName: "Valle Sagrado y Machu Picchu", startDate: toDateInput(daysFromNow(35)), endDate: toDateInput(daysFromNow(44)), passengerCount: 2, route: "Cusco - Valle Sagrado - Machu Picchu - Cusco" },
  });
  const quot14 = await createQuotation({ request: req14, service: svc14, client: clients[3], status: "ACEPTADA", items: [{ service: "Circuito Valle Sagrado y Machu Picchu", quantity: 2, unitPrice: 475000, total: 950000 }] });
  await createConfirmation({ request: req14, service: svc14, provider: explora, price: 950000, providerConfirmationNumber: "EXP-778812" });
  await createPayment({ request: req14, quotation: quot14, client: clients[3], amount: 950000, status: "COMPLETADO" });
  await createVoucher({ request: req14, client: clients[3], provider: explora, status: "EMITIDO", serviceType: "CIRCUITO", serviceName: "Valle Sagrado y Machu Picchu", destination: "Cusco, Perú", amount: 950000 });

  // 15. ENVIADA_CONFIRMACION_CLIENTE
  const req15 = await createRequest({ client: clients[4], destinationCountry: "Brasil", destinationCity: "Río de Janeiro", durationDays: 6, description: "Seguro de viaje para carnaval.", status: "ENVIADA_CONFIRMACION_CLIENTE" });
  await createService({
    request: req15, type: "SEGURO", status: "ENVIADA_CONFIRMACION_CLIENTE", provider: seguros, price: 90000,
    details: { type: "SEGURO", fullName: `${clients[4].firstName} ${clients[4].lastName}`, address: clients[4].address ?? "Sin dirección registrada", birthDate: clients[4].birthDate ?? "1982-01-01", phone: clients[4].phone ?? "+56 9 0000 0000", tripStartDate: toDateInput(daysFromNow(22)), tripEndDate: toDateInput(daysFromNow(28)), emergencyContactName: "Contacto de Emergencia", planType: "Plan Plata" },
  });

  // 16. PAGADO_AL_PROVEEDOR
  const req16 = await createRequest({ client: clients[5], destinationCountry: "Chile", destinationCity: "Antofagasta", durationDays: 5, description: "Arriendo de camioneta para el desierto.", status: "PAGADO_AL_PROVEEDOR" });
  await createService({
    request: req16, type: "ARRIENDO_AUTO", status: "PAGADO_AL_PROVEEDOR", provider: hertz, price: 280000,
    details: { type: "ARRIENDO_AUTO", clientName: `${clients[5].firstName} ${clients[5].lastName}`, pickupDate: toDateInput(daysFromNow(8)), pickupTime: "09:00", dropoffDate: toDateInput(daysFromNow(13)), dropoffTime: "09:00", pickupAddress: "Aeropuerto de Antofagasta", dropoffAddress: "Aeropuerto de Antofagasta", carType: "Camioneta", carBrand: "Toyota", carModel: "Hilux", unlimitedMileage: false, mileageLimitPerDay: 200 },
  });

  // 17. VOUCHER_ENTREGADO
  const req17 = await createRequest({ client: clients[6], destinationCountry: "Chile", destinationCity: "San Pedro de Atacama", durationDays: 4, description: "Hotel boutique en el desierto.", status: "VOUCHER_ENTREGADO" });
  await createService({
    request: req17, type: "ALOJAMIENTO", status: "VOUCHER_ENTREGADO", provider: hotelEnjoy, price: 620000,
    details: { type: "ALOJAMIENTO", roomCount: 1, rooms: [{ responsibleName: `${clients[6].firstName} ${clients[6].lastName}`, roomType: "DOBLE" }], checkIn: toDateInput(daysFromNow(14)), checkOut: toDateInput(daysFromNow(18)), hotelName: "Hotel Enjoy Atacama", hotelCity: "San Pedro de Atacama", hotelCountry: "Chile", hotelChain: "Enjoy", starRating: 4 },
  });

  console.log("🎉 Seed del flujo de negocio completado: 17 solicitudes cubriendo los 17 estados + 1 cancelada.");
  console.log("   ↳ 3 solicitudes quedaron 'atrasadas' (>24h) para probar el cron de notificaciones.");
}

main()
  .catch((error) => {
    console.error("❌ Error durante seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
