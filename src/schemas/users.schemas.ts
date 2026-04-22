import { AgencyRole, UserRole } from "@prisma/client";
import { z } from "zod";
import { idParamSchema, paginationQuerySchema } from "./common.schemas";

export const userIdParamSchema = idParamSchema;

export const usersListQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional()
});

export const updateUserSchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  agencyRole: z.nativeEnum(AgencyRole).nullable().optional(),
  isActive: z.boolean().optional()
});
