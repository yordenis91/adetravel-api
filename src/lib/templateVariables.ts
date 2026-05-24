export const TEMPLATE_TYPES = [
  { value: "QUOTATION_SENT", label: "Cotización Enviada", color: "purple" },
  { value: "PAYMENT_CONFIRMED", label: "Pago Confirmado", color: "green" },
  { value: "VOUCHER_ISSUED", label: "Voucher Emitido", color: "navy" },
  { value: "REQUEST_CREATED", label: "Solicitud Creada", color: "amber" },
  { value: "CUSTOM", label: "Personalizado", color: "gray" },
];

export const TEMPLATE_VARIABLES: Record<string, { name: string; description: string; sample: string }[]> = {
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
  "CUSTOM": [
    { name: "client_name", description: "Nombre del cliente", sample: "María González" },
    { name: "agency_name", description: "Nombre de la agencia", sample: "ADE Travel" },
    { name: "agency_email", description: "Email de la agencia", sample: "contacto@adetravel.cl" },
  ]
};

// Motor de renderizado en vivo para la vista previa del frontend
export function renderWithSampleData(html: string, type: string) {
  const vars = TEMPLATE_VARIABLES[type] || TEMPLATE_VARIABLES.CUSTOM;
  let rendered = html;
  
  vars.forEach(v => {
    const regex = new RegExp(`\\{\\{${v.name}\\}\\}`, "g");
    rendered = rendered.replace(regex, v.sample);
  });
  
  return rendered;
}