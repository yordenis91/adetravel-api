import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import { createClientSchema, CreateClientInput } from "../validators/clients.validator";
import { createActivityLog } from "./activity-log.service";

export type ImportRowStatus = "valid" | "invalid" | "duplicate";

export interface ImportRowResult {
  /** Número de fila dentro del archivo de datos (1 = primera fila de datos). */
  row: number;
  status: ImportRowStatus;
  /** Nombre para mostrar en la vista previa. */
  label: string;
  /** Motivo, si la fila no es válida o es duplicada. */
  reasons: string[];
}

export interface ImportSummary {
  dryRun: boolean;
  total: number;
  /** Filas válidas: las que se guardarían (dryRun) o se guardaron. */
  valid: number;
  duplicates: number;
  invalid: number;
  rows: ImportRowResult[];
}

/** RUT sin puntos, guion ni espacios y en mayúsculas: "12.345.678-k" y "12345678K" son el mismo. */
export const normalizeRut = (rut: string): string => rut.replace(/[.\-\s]/g, "").toUpperCase();

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Valida las filas, detecta duplicados (contra la base y dentro del mismo archivo, por RUT o correo)
 * y, si no es `dryRun`, guarda las válidas en una sola transacción. Los duplicados se omiten: nunca
 * se pisa un cliente existente.
 */
export async function importClients(rows: Record<string, unknown>[], dryRun: boolean, userId: string): Promise<ImportSummary> {
  const existing = await prisma.client.findMany({ select: { rut: true, email: true } });
  const knownRuts = new Set(existing.flatMap((c) => (c.rut ? [normalizeRut(c.rut)] : [])));
  const knownEmails = new Set(existing.flatMap((c) => (c.email ? [normalizeEmail(c.email)] : [])));

  const results: ImportRowResult[] = [];
  const toCreate: CreateClientInput[] = [];

  rows.forEach((raw, index) => {
    const row = index + 1;
    const parsed = createClientSchema.safeParse(raw);
    const fallbackLabel = [raw.firstName, raw.lastName].filter((v) => typeof v === "string" && v).join(" ") || `Fila ${row}`;
    if (!parsed.success) {
      const reasons = parsed.error.issues.map((i) => (i.path.length ? `${String(i.path[0])}: ${i.message}` : i.message));
      results.push({ row, status: "invalid", label: fallbackLabel, reasons });
      return;
    }
    const data = parsed.data;
    const label = `${data.firstName} ${data.lastName}`;
    const reasons: string[] = [];
    const rut = data.rut ? normalizeRut(data.rut) : "";
    const email = data.email ? normalizeEmail(data.email) : "";
    if (rut && knownRuts.has(rut)) reasons.push(`El RUT ${data.rut} ya existe`);
    if (email && knownEmails.has(email)) reasons.push(`El correo ${data.email} ya existe`);
    if (reasons.length) {
      results.push({ row, status: "duplicate", label, reasons });
      return;
    }
    // Las filas válidas también cuentan como "ya vistas": un duplicado dentro del archivo se omite.
    if (rut) knownRuts.add(rut);
    if (email) knownEmails.add(email);
    results.push({ row, status: "valid", label, reasons: [] });
    toCreate.push(data);
  });

  const summary: ImportSummary = {
    dryRun,
    total: rows.length,
    valid: toCreate.length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    invalid: results.filter((r) => r.status === "invalid").length,
    rows: results,
  };

  if (!dryRun && toCreate.length > 0) {
    await prisma.client.createMany({ data: toCreate.map((c) => ({ ...c, createdBy: userId })) });
    await createActivityLog({
      action: "CREATE",
      entityType: "Client",
      entityId: randomUUID(),
      entityLabel: `Importación de ${toCreate.length} clientes`,
      description: `Importación desde archivo: ${toCreate.length} creados, ${summary.duplicates} duplicados omitidos, ${summary.invalid} con errores`,
      performedBy: userId,
    });
  }
  return summary;
}
