import { AgencyRole, UserRole } from "@prisma/client";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const updateMeSchema = z.object({
  fullName: z.string().min(3).optional(),
  phone: z.string().min(6).optional(),
  department: z.string().min(2).optional()
});

export const inviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(3),
  role: z.nativeEnum(UserRole),
  agencyRole: z.nativeEnum(AgencyRole).optional(),
  password: z.string().min(8)
});
