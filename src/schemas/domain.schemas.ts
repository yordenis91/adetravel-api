import { PaymentMethod, PaymentStatus, QuotationStatus, RequestStatus, VoucherStatus } from "@prisma/client";
import { z } from "zod";
import { idParamSchema, paginationQuerySchema } from "./common.schemas";

export const idSchema = idParamSchema;

export const clientsQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  isActive: z.enum(["true", "false"]).optional(),
  sort: z.string().optional()
});
export const clientCreateSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email().optional(),
  phone: z.string().optional()
}).passthrough();
export const clientUpdateSchema = clientCreateSchema.partial();

export const providersQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  businessType: z.string().optional(),
  isActive: z.enum(["true", "false"]).optional()
});
export const providerCreateSchema = z.object({ name: z.string().min(2) }).passthrough();
export const providerUpdateSchema = providerCreateSchema.partial();

export const requestsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(RequestStatus).optional(),
  clientId: z.string().uuid().optional(),
  search: z.string().optional()
});
export const requestCreateSchema = z.object({ clientId: z.string().uuid() }).passthrough();
export const requestUpdateSchema = requestCreateSchema.partial();

export const quotationsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(QuotationStatus).optional(),
  clientId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  search: z.string().optional()
});
export const quotationCreateSchema = z.object({
  requestId: z.string().uuid(),
  clientId: z.string().uuid(),
  items: z.array(z.record(z.string(), z.unknown())).default([])
}).passthrough();
export const quotationUpdateSchema = quotationCreateSchema.partial().extend({
  status: z.nativeEnum(QuotationStatus).optional()
});

export const paymentsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(PaymentStatus).optional(),
  clientId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional()
});
export const paymentCreateSchema = z.object({
  requestId: z.string().uuid(),
  clientId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.nativeEnum(PaymentMethod)
}).passthrough();
export const paymentUpdateSchema = paymentCreateSchema.partial().extend({
  status: z.nativeEnum(PaymentStatus).optional()
});

export const vouchersQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(VoucherStatus).optional(),
  clientId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional()
});
export const voucherCreateSchema = z.object({
  requestId: z.string().uuid(),
  clientId: z.string().uuid()
}).passthrough();
export const voucherUpdateSchema = voucherCreateSchema.partial().extend({
  status: z.nativeEnum(VoucherStatus).optional()
});

export const activityLogQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().optional(),
  entityId: z.string().optional()
});

export const systemConfigUpsertSchema = z.object({}).passthrough();

export const emailTemplatesQuerySchema = paginationQuerySchema.extend({
  type: z.string().optional(),
  isActive: z.enum(["true", "false"]).optional()
});
export const emailTemplateCreateSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(2),
  subject: z.string().min(2),
  bodyHtml: z.string().min(2)
}).passthrough();
export const emailTemplateUpdateSchema = emailTemplateCreateSchema.partial();
