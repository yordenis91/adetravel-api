import { z } from "zod";

export const createClientSchema = z.object({
  firstName: z.string().min(1, "El nombre es obligatorio").max(100),
  lastName: z.string().min(1, "El apellido es obligatorio").max(100),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  rut: z.string().max(20).optional(),
  passportNumber: z.string().max(30).optional(),
  passportExpiry: z.string().optional(),   // "YYYY-MM-DD"
  passportIssueDate: z.string().optional(),
  passportCountry: z.string().max(100).optional(),
  birthDate: z.string().optional(),
  nationality: z.string().max(100).optional(),
  address: z.string().max(300).optional(),
  frequentFlyerNumbers: z.array(z.string()).default([]),
  restrictions: z.string().max(500).optional(),
  referralSource: z.enum(["CONSULATE", "REFERRAL", "WEBSITE", "OTHER"]).optional(),
  bankAccount: z.string().max(50).optional(),
  bankName: z.string().max(100).optional(),
  bankAccountHolder: z.string().max(100).optional(),
  bankEmail: z.string().email("Email bancario inválido").optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;