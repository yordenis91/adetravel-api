import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

/**
 * Enlace público de una cotización (`/c/<código>`).
 *
 * El código NO se guarda: es `<id del enlace sin guiones><HMAC-SHA256 en base64url>`. Así el agente puede
 * volver a copiar el enlace cuando quiera y, aun así, una fuga de la base no entrega enlaces utilizables
 * (falta la clave, que vive en el entorno). Tiene 256 bits de firma: no se puede adivinar.
 */
const SIGNATURE_LENGTH = 43; // 32 bytes en base64url, sin relleno
const ID_HEX_LENGTH = 32;
const GRACE_DAYS_AFTER_VALIDITY = 30;
const DEFAULT_LIFETIME_DAYS = 60;
const MIN_LIFETIME_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const secret = () => env.QUOTATION_LINK_SECRET ?? env.JWT_SECRET;

const sign = (hexId: string): string =>
  crypto.createHmac("sha256", secret()).update(`quotation-link:${hexId}`).digest("base64url");

const toHex = (id: string) => id.replace(/-/g, "");
const fromHex = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

export function buildLinkCode(linkId: string): string {
  const hex = toHex(linkId);
  return `${hex}${sign(hex)}`;
}

/** Devuelve el id del enlace si el código es auténtico; null si está mal formado o la firma no coincide. */
export function parseLinkCode(code: string): string | null {
  if (typeof code !== "string" || code.length !== ID_HEX_LENGTH + SIGNATURE_LENGTH) return null;
  const hex = code.slice(0, ID_HEX_LENGTH);
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  const expected = Buffer.from(sign(hex));
  const received = Buffer.from(code.slice(ID_HEX_LENGTH));
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  return fromHex(hex);
}

export function buildLinkUrl(linkId: string): string {
  return `${env.FRONTEND_URL.replace(/\/+$/, "")}/c/${buildLinkCode(linkId)}`;
}

/** Vence 30 días después de la vigencia de la cotización (la página sigue mostrando «vencida» y ofrece pedir una nueva). */
export function computeLinkExpiry(validUntil: string | null | undefined, now: Date = new Date()): Date {
  const minimum = new Date(now.getTime() + MIN_LIFETIME_DAYS * DAY_MS);
  if (!validUntil || !/^\d{4}-\d{2}-\d{2}/.test(validUntil)) return new Date(now.getTime() + DEFAULT_LIFETIME_DAYS * DAY_MS);
  const end = new Date(`${validUntil.slice(0, 10)}T00:00:00Z`).getTime() + (GRACE_DAYS_AFTER_VALIDITY + 1) * DAY_MS;
  return new Date(Math.max(end, minimum.getTime()));
}

const isLive = (link: { revokedAt: Date | null; expiresAt: Date }, now = new Date()) => !link.revokedAt && link.expiresAt > now;

/** El enlace vigente de la cotización, si lo hay. */
export async function findActiveLink(quotationId: string) {
  const link = await prisma.quotationLink.findFirst({ where: { quotationId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  return link && isLive(link) ? link : null;
}

/**
 * Reutiliza el enlace vigente (un reenvío no debe invalidar el enlace que el cliente ya tiene en su correo)
 * y le actualiza el vencimiento por si cambió la vigencia; si no hay, crea uno.
 */
export async function getOrCreateActiveLink(quotationId: string, validUntil: string | null, createdBy: string | null) {
  const expiresAt = computeLinkExpiry(validUntil);
  const existing = await findActiveLink(quotationId);
  if (existing) {
    return existing.expiresAt < expiresAt
      ? prisma.quotationLink.update({ where: { id: existing.id }, data: { expiresAt } })
      : existing;
  }
  return prisma.quotationLink.create({ data: { quotationId, createdBy, expiresAt } });
}

/** Revoca el enlace vigente y crea uno nuevo (el anterior pasa a dar 404). */
export async function regenerateLink(quotationId: string, validUntil: string | null, createdBy: string | null) {
  await prisma.quotationLink.updateMany({ where: { quotationId, revokedAt: null }, data: { revokedAt: new Date() } });
  return prisma.quotationLink.create({ data: { quotationId, createdBy, expiresAt: computeLinkExpiry(validUntil) } });
}

export async function revokeLinks(quotationId: string): Promise<number> {
  const result = await prisma.quotationLink.updateMany({ where: { quotationId, revokedAt: null }, data: { revokedAt: new Date() } });
  return result.count;
}

/** Busca el enlace de un código; null (siempre el mismo resultado) si es falso, desconocido, revocado o vencido. */
export async function resolveLink(code: string) {
  const id = parseLinkCode(code);
  if (!id) return null;
  const link = await prisma.quotationLink.findUnique({
    where: { id },
    include: { quotation: { include: { client: true, request: { select: { destinationCity: true, destinationCountry: true, status: true } } } } },
  });
  return link && isLive(link) ? link : null;
}

const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|skype|slack|discord|linkedin|twitter|curl|wget|python|java\/|go-http|okhttp|axios|node-fetch|headless|lighthouse|pingdom|uptime|monitor|scan|proofpoint|mimecast|barracuda|safelinks|outlook-ios|googleimageproxy|yahoomailproxy/i;

/** Visitas automáticas (antivirus, previsualizadores, buscadores): no cuentan como «el cliente la abrió». */
export function isAutomatedClient(userAgent: string | undefined): boolean {
  if (!userAgent || userAgent.length < 10) return true;
  return BOT_PATTERN.test(userAgent);
}

export type DeviceType = "mobile" | "tablet" | "desktop";

export function detectDevice(userAgent: string | undefined): DeviceType {
  const ua = userAgent ?? "";
  if (/ipad|tablet|kindle|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|opera mini|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

/** Resumen de seguimiento que ve el agente en la lista y el detalle de la cotización. */
export interface TrackingSummary {
  hasLink: boolean;
  viewCount: number;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  acceptanceRequestedAt: Date | null;
  sentAt: Date | null;
  expiresAt: Date | null;
}

export function summarizeTracking(links: { createdAt: Date; expiresAt: Date; revokedAt: Date | null; viewCount: number; firstViewedAt: Date | null; lastViewedAt: Date | null; acceptanceRequestedAt: Date | null }[] | undefined): TrackingSummary {
  const link = (links ?? []).filter((l) => isLive(l)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return {
    hasLink: !!link,
    viewCount: link?.viewCount ?? 0,
    firstViewedAt: link?.firstViewedAt ?? null,
    lastViewedAt: link?.lastViewedAt ?? null,
    acceptanceRequestedAt: link?.acceptanceRequestedAt ?? null,
    sentAt: link?.createdAt ?? null,
    expiresAt: link?.expiresAt ?? null,
  };
}
