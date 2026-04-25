import { AgencyRole, UserRole } from "@prisma/client";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const registerSchema = z.object({
  fullName: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string().min(8)
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"]
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
