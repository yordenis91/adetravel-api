export const QUOTATION_STATUSES = ["Borrador", "Enviada", "Aceptada", "Rechazada"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const VALID_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  Borrador: ["Enviada", "Rechazada"],
  Enviada: ["Aceptada", "Rechazada", "Borrador"],
  Aceptada: [],
  Rechazada: ["Borrador"]
};

export const createQuotationSchema = {
  safeParse: (data: any) => ({
    success: true,
    data: data,
    error: null
  })
};

export const updateQuotationSchema = {
  safeParse: (data: any) => ({
    success: true,
    data: data,
    error: null
  })
};

export const changeStatusSchema = {
  safeParse: (data: any) => ({
    success: true,
    data: data,
    error: null
  })
};

export const quotationItemSchema = {
  safeParse: (data: any) => ({
    success: true,
    data: data,
    error: null
  })
};
