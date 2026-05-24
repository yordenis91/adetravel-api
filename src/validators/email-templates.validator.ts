import { z } from "zod";

export const EMAIL_TEMPLATE_TYPES = [
  "QUOTATION_SENT",
  "PAYMENT_CONFIRMED",
  "VOUCHER_ISSUED",
  "REQUEST_CREATED",
  "CUSTOM",
] as const;

export const TEMPLATE_VARIABLES_MAP: Record<string, { name: string; description: string; sample: string }[]> = {
  "QUOTATION_SENT": [
    { name: "client_name", description: "Nombre del cliente", sample: "María González" },
    { name: "quotation_number", description: "Número de cotización", sample: "COTIZ-2024-05-0001" },
    { name: "valid_until", description: "Fecha de vencimiento", sample: "30 de mayo, 2024" },
    { name: "destination", description: "Destino del viaje", sample: "Santiago → París" },
    { name: "total", description: "Total de la cotización", sample: "$2.450.000" },
    { name: "currency", description: "Moneda", sample: "CLP" },
    { name: "agency_name", description: "Nombre de la agencia", sample: "ADE Travel" },
    { name: "agency_email", description: "Email de la agencia", sample: "contacto@adetravel.cl" },
  ],
  "PAYMENT_CONFIRMED": [
    { name: "client_name", description: "Nombre del cliente", sample: "María González" },
    { name: "payment_number", description: "Número de pago", sample: "PAG-2024-05-0001" },
    { name: "amount", description: "Monto del pago", sample: "$850.000" },
    { name: "currency", description: "Moneda", sample: "CLP" },
    { name: "payment_date", description: "Fecha del pago", sample: "15 de mayo, 2024" },
    { name: "payment_method", description: "Método de pago", sample: "Transferencia Bancaria" },
    { name: "reference", description: "Referencia/comprobante", sample: "REF-123456" },
    { name: "agency_name", description: "Nombre de la agencia", sample: "ADE Travel" },
    { name: "agency_email", description: "Email de la agencia", sample: "contacto@adetravel.cl" },
  ],
  "VOUCHER_ISSUED": [
    { name: "client_name", description: "Nombre del cliente", sample: "María González" },
    { name: "voucher_number", description: "Número de voucher", sample: "VCH-2024-05-0001" },
    { name: "service_name", description: "Nombre del servicio", sample: "Hotel Grand Palace" },
    { name: "service_type", description: "Tipo de servicio", sample: "Hotel" },
    { name: "destination", description: "Destino", sample: "París, Francia" },
    { name: "check_in", description: "Fecha de entrada", sample: "01 de junio, 2024" },
    { name: "check_out", description: "Fecha de salida", sample: "08 de junio, 2024" },
    { name: "confirmation_code", description: "Código de confirmación", sample: "CONF-789ABC" },
    { name: "passengers", description: "Lista de pasajeros", sample: "María González, Juan González" },
    { name: "agency_name", description: "Nombre de la agencia", sample: "ADE Travel" },
  ],
  "REQUEST_CREATED": [
    { name: "client_name", description: "Nombre del cliente", sample: "María González" },
    { name: "request_number", description: "Número de solicitud", sample: "ADET-2024-05-0001" },
    { name: "destination", description: "Destino del viaje", sample: "Santiago → París" },
    { name: "request_date", description: "Fecha de la solicitud", sample: "10 de mayo, 2024" },
    { name: "agency_name", description: "Nombre de la agencia", sample: "ADE Travel" },
    { name: "agency_email", description: "Email de la agencia", sample: "contacto@adetravel.cl" },
  ],
  "CUSTOM": [
    { name: "client_name", description: "Nombre del cliente", sample: "María González" },
    { name: "agency_name", description: "Nombre de la agencia", sample: "ADE Travel" },
  ]
};

export const listTemplatesSchema = z.object({
  type: z.enum(EMAIL_TEMPLATE_TYPES).optional(),
  search: z.string().optional(),
  isActive: z.enum(["true", "false"]).transform(v => v === "true").optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(150),
  type: z.enum(EMAIL_TEMPLATE_TYPES),
  description: z.string().max(500).optional(),
  subject: z.string().min(1, "El asunto es obligatorio"),
  bodyHtml: z.string().min(1, "El cuerpo HTML es obligatorio"),
  isActive: z.boolean().optional().default(true),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const toggleTemplateSchema = z.object({
  isActive: z.boolean({ message: "El campo isActive es obligatorio" })
});

export const previewTemplateSchema = z.object({
  bodyHtml: z.string().min(1),
  type: z.enum(EMAIL_TEMPLATE_TYPES),
});