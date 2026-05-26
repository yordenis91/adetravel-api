import { z } from "zod";

// Alineado con el enum `AgencyRole` en prisma/schema.prisma
export const AGENCY_ROLES = ["GERENTE", "FINANZAS", "OPERACIONES", "AGENTE_VENTAS"] as const;
export const SYSTEM_ROLES = ["ADMINISTRADOR", "USUARIO"] as const;

export const usersListQuerySchema = z.object({
  search: z.string().optional(),
  agencyRole: z.enum(AGENCY_ROLES).optional(),
  isActive: z.enum(["true", "false"]).transform((val) => val === "true").optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().optional().default(50),
});

export const updateUserSchema = z.object({
  role: z.enum(SYSTEM_ROLES).optional(),
  agencyRole: z.enum(AGENCY_ROLES).optional().nullable(),
  isActive: z.boolean().optional(),
  department: z.string().max(100).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
});

export const userIdParamSchema = z.object({
  id: z.string().uuid("ID de usuario inválido"),
});