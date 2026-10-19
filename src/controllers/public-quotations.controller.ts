import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { ApiError } from "../utils/api-error";
import { sendItem } from "../utils/response";
import { isExpired, todayISO } from "../utils/dates";
import { createActivityLog } from "../services/activity-log.service";
import { generateQuotationPdfBuffer } from "../services/pdf.service";
import { detectDevice, isAutomatedClient, resolveLink } from "../services/quotation-link.service";
import { createQuotationTask, notifyQuotationTeam } from "../services/quotation-notify.service";
import type { PublicMessageInput } from "../validators/public-quotations.validator";

/**
 * Páginas públicas de una cotización (sin sesión). Reglas de oro:
 *  - Un código falso, desconocido, revocado o vencido responde SIEMPRE lo mismo (404), sin distinguir el motivo.
 *  - Solo sale lo que corresponde al cliente: nada de RUT, datos bancarios ni ids internos.
 *  - Solo se cuentan visitas de personas: se ignoran bots/antivirus/previsualizadores y al personal con sesión iniciada.
 */
const NOT_AVAILABLE = () => new ApiError("Este enlace no está disponible. Pide a tu agente que te envíe uno nuevo.", 404, "LINK_NOT_FOUND");
/** Dos aperturas con menos de este tiempo de diferencia cuentan como la misma visita (refrescos, abrir en dos pestañas). */
const SAME_VISIT_MS = 30 * 60 * 1000;
/** Solo se vuelve a avisar al agente de una apertura si pasó al menos este tiempo desde la anterior. */
const REOPEN_NOTICE_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGES_PER_DAY = 5;

type State = "open" | "accepted" | "expired" | "closed";

function stateOf(quotation: { status: string; validUntil: string | null }): State | null {
  if (quotation.status === "ACEPTADA") return "accepted";
  if (quotation.status === "RECHAZADA") return "closed";
  if (quotation.status !== "ENVIADA") return null; // BORRADOR: todavía no se le envió nada al cliente
  return isExpired(quotation.validUntil) ? "expired" : "open";
}

/** True si la petición trae la sesión de alguien del equipo: sus aperturas (vista previa) no cuentan. */
function isStaffRequest(req: Request): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  try {
    return typeof (jwt.verify(header.slice(7), env.JWT_SECRET) as jwt.JwtPayload).id === "string";
  } catch {
    return false;
  }
}

const countsAsClient = (req: Request) => !isAutomatedClient(req.get("user-agent")) && !isStaffRequest(req);

function setPrivateHeaders(res: Response): void {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
}

async function loadLinkOr404(req: Request) {
  const link = await resolveLink(String(req.params.code));
  if (!link) throw NOT_AVAILABLE();
  const state = stateOf(link.quotation);
  if (!state) throw NOT_AVAILABLE();
  return { link, state };
}

async function agencyForPublic() {
  const config = await prisma.systemConfig.findFirst();
  return {
    name: config?.agencyFantasyName?.trim() || config?.agencyName?.trim() || "ADE Travel",
    email: config?.agencyEmail?.trim() || null,
    phone: config?.agencyPhone?.trim() || null,
    website: config?.agencyWebsite?.trim() || null,
    logoUrl: config?.agencyLogoUrl?.trim() || null,
  };
}

/** Registra la apertura y avisa al agente la primera vez (o cuando vuelve a abrirla pasado un día). */
async function recordView(link: NonNullable<Awaited<ReturnType<typeof resolveLink>>>, req: Request): Promise<void> {
  const now = new Date();
  // Reclamo atómico de «visita nueva»: si llegan varias aperturas a la vez (o un refresco), solo una cumple la
  // condición de la base y suma; el resto solo renueva la última actividad. Sin esto una ráfaga contaba varias visitas.
  const startsVisit = (await prisma.quotationLink.updateMany({
    where: { id: link.id, OR: [{ lastViewedAt: null }, { lastViewedAt: { lt: new Date(now.getTime() - SAME_VISIT_MS) } }] },
    data: { lastViewedAt: now, viewCount: { increment: 1 } },
  })).count > 0;
  if (!startsVisit) {
    await prisma.quotationLink.update({ where: { id: link.id }, data: { lastViewedAt: now } });
    return;
  }
  const first = (await prisma.quotationLink.updateMany({ where: { id: link.id, firstViewedAt: null }, data: { firstViewedAt: now } })).count > 0;
  await prisma.quotationLinkEvent.create({ data: { linkId: link.id, type: "VIEW", device: detectDevice(req.get("user-agent")) } });

  const reopenedAfterADay = !first && !!link.lastViewedAt && now.getTime() - link.lastViewedAt.getTime() > REOPEN_NOTICE_MS;
  if (!first && !reopenedAfterADay) return;
  const q = link.quotation;
  await notifyQuotationTeam({
    quotation: q,
    senderId: link.createdBy,
    type: "QUOTATION_VIEWED",
    title: first ? "Abrieron tu cotización" : "Volvieron a abrir tu cotización",
    message: first
      ? `${q.client.firstName} abrió la cotización ${q.quotationNumber} por primera vez. Es un buen momento para escribirle.`
      : `${q.client.firstName} volvió a abrir la cotización ${q.quotationNumber}.`,
  });
}

export async function viewPublicQuotation(req: Request, res: Response): Promise<void> {
  setPrivateHeaders(res);
  const { link, state } = await loadLinkOr404(req);
  if (countsAsClient(req)) await recordView(link, req);

  const q = link.quotation;
  const agent = link.createdBy ? await prisma.user.findUnique({ where: { id: link.createdBy }, select: { fullName: true } }) : null;
  const base = {
    state,
    quotationNumber: q.quotationNumber,
    clientFirstName: q.client.firstName,
    agency: await agencyForPublic(),
    agentName: agent?.fullName ?? null,
    validUntil: q.validUntil,
  };
  // Vencida o cerrada: no se muestran precios, solo cómo pedir una nueva.
  if (state === "expired" || state === "closed") {
    sendItem(res, base);
    return;
  }
  const items = (q.items as unknown as Record<string, unknown>[]).map((i) => ({
    service: String(i.service ?? ""),
    description: String(i.description ?? ""),
    quantity: Number(i.quantity ?? 0),
    unitPrice: Number(i.unitPrice ?? 0),
    total: Number(i.total ?? 0),
  }));
  sendItem(res, {
    ...base,
    destination: [q.request?.destinationCity, q.request?.destinationCountry].filter(Boolean).join(", ") || null,
    currency: q.currency,
    items,
    subtotal: q.subtotal ?? 0,
    discount: q.discount ?? 0,
    taxPercentage: q.taxPercentage ?? 0,
    taxAmount: q.taxAmount ?? 0,
    total: q.total ?? 0,
    notes: q.notes || null,
    termsAndConditions: q.termsAndConditions || null,
    createdAt: q.createdAt,
    canAccept: state === "open" && !link.acceptanceRequestedAt,
    acceptanceRequested: !!link.acceptanceRequestedAt,
  });
}

export async function downloadPublicQuotationPdf(req: Request, res: Response): Promise<void> {
  setPrivateHeaders(res);
  const { link, state } = await loadLinkOr404(req);
  if (state !== "open" && state !== "accepted") throw NOT_AVAILABLE();
  if (countsAsClient(req)) {
    await prisma.quotationLinkEvent.create({ data: { linkId: link.id, type: "DOWNLOAD", device: detectDevice(req.get("user-agent")) } });
  }
  const buffer = await generateQuotationPdfBuffer({ ...link.quotation, client: link.quotation.client });
  res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${link.quotation.quotationNumber}.pdf"` });
  res.send(buffer);
}

/** «Quiero aceptar»: NO cambia el estado (eso habilita pagos); avisa al agente y al gerente para que lo confirmen. */
export async function requestPublicAcceptance(req: Request, res: Response): Promise<void> {
  setPrivateHeaders(res);
  const { link, state } = await loadLinkOr404(req);
  if (state === "accepted") {
    sendItem(res, { requested: true, alreadyRequested: true });
    return;
  }
  if (state !== "open") throw new ApiError("Esta cotización ya no se puede aceptar desde el enlace. Escribe a tu agente.", 409, "QUOTATION_NOT_ACCEPTABLE");
  const { contactName } = req.body as PublicMessageInput;
  const now = new Date();
  const claimed = await prisma.quotationLink.updateMany({ where: { id: link.id, acceptanceRequestedAt: null }, data: { acceptanceRequestedAt: now } });
  if (claimed.count === 0) {
    sendItem(res, { requested: true, alreadyRequested: true });
    return;
  }
  const q = link.quotation;
  await prisma.quotationLinkEvent.create({ data: { linkId: link.id, type: "ACCEPT_REQUEST", contactName: contactName ?? null, device: detectDevice(req.get("user-agent")) } });
  const who = contactName ? `${contactName} (${q.client.firstName})` : q.client.firstName;
  const message = `${who} quiere aceptar la cotización ${q.quotationNumber}. Confírmala para dar paso al cobro.`;
  await createQuotationTask({
    userId: link.createdBy ?? q.createdBy,
    title: `Confirmar aceptación de ${q.quotationNumber}`,
    description: message,
    priority: "ALTA",
    quotation: q,
    dueDate: todayISO(),
  });
  await notifyQuotationTeam({
    quotation: q, senderId: link.createdBy, type: "QUOTATION_ACCEPT_REQUESTED",
    title: "El cliente quiere aceptar", message, includeManagers: true, emailAgent: true,
  });
  await createActivityLog({
    action: "UPDATE", entityType: "Quotation", entityId: q.id, entityLabel: q.quotationNumber,
    description: "El cliente pidió aceptar la cotización desde el enlace (pendiente de confirmación del agente)",
  });
  sendItem(res, { requested: true, alreadyRequested: false });
}

async function recordMessage(req: Request, res: Response, kind: "QUESTION" | "RENEW_REQUEST"): Promise<void> {
  setPrivateHeaders(res);
  const { link, state } = await loadLinkOr404(req);
  const { message, contactName } = req.body as PublicMessageInput;
  if (kind === "RENEW_REQUEST" && state !== "expired") {
    throw new ApiError("Esta cotización sigue vigente.", 409, "QUOTATION_NOT_EXPIRED");
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await prisma.quotationLinkEvent.count({ where: { linkId: link.id, type: { in: ["QUESTION", "RENEW_REQUEST"] }, createdAt: { gte: since } } });
  if (recent >= MAX_MESSAGES_PER_DAY) {
    throw new ApiError("Ya enviaste varios mensajes hoy. Tu agente los está revisando.", 429, "TOO_MANY_MESSAGES");
  }
  const q = link.quotation;
  await prisma.quotationLinkEvent.create({
    data: { linkId: link.id, type: kind, contactName: contactName ?? null, message: message ?? null, device: detectDevice(req.get("user-agent")) },
  });
  const who = contactName ? `${contactName} (${q.client.firstName})` : q.client.firstName;
  const renew = kind === "RENEW_REQUEST";
  const text = renew
    ? `${who} pidió actualizar la cotización vencida ${q.quotationNumber}.${message ? ` Dice: «${message}»` : ""}`
    : `${who} tiene una consulta sobre ${q.quotationNumber}: «${message}»`;
  await createQuotationTask({
    userId: link.createdBy ?? q.createdBy,
    title: renew ? `Actualizar cotización vencida ${q.quotationNumber}` : `Responder consulta de ${q.client.firstName} (${q.quotationNumber})`,
    description: text,
    priority: "ALTA",
    quotation: q,
    dueDate: todayISO(),
  });
  await notifyQuotationTeam({
    quotation: q, senderId: link.createdBy,
    type: renew ? "QUOTATION_RENEW_REQUESTED" : "QUOTATION_QUESTION",
    title: renew ? "Piden renovar una cotización vencida" : "El cliente tiene una consulta",
    message: text,
    // Una venta vencida pero con interés es dinero recuperable: el gerente también lo ve.
    includeManagers: renew,
    emailAgent: true,
  });
  sendItem(res, { sent: true });
}

export const askPublicQuestion = (req: Request, res: Response) => recordMessage(req, res, "QUESTION");
export const requestPublicRenewal = (req: Request, res: Response) => recordMessage(req, res, "RENEW_REQUEST");
