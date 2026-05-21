import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/api-error";

/**
 * Servicio encargado de generar documentos PDF para Cotizaciones, Vouchers, etc.
 * Nota: Aquí a futuro puedes integrar librerías como 'pdfkit', 'pdfmake' o 'puppeteer'.
 */
export async function generateQuotationPdfBuffer(quotationId: string): Promise<Buffer> {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      client: true,
      request: true,
      // Si tienes un modelo de items (ej. QuotationItem), inclúyelo aquí:
      // items: true 
    }
  });

  if (!quotation) {
    throw new ApiError("Cotización no encontrada para generar PDF", 404);
  }

  // --- LÓGICA DE GENERACIÓN DE PDF ---
  // Por ahora, devolvemos un Buffer simulado de texto plano convertido a PDF básico.
  // Al implementar pdfkit, aquí crearías el documento con el logo de ADE Travel.
  
  const content = `
    COTIZACIÓN ADE TRAVEL
    -------------------------------------------------
    N° Cotización: ${quotation.quotationNumber}
    Cliente: ${quotation.client.firstName} ${quotation.client.lastName}
    Total: ${quotation.currency} ${quotation.total}
    Válido hasta: ${quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString('es-CL') : 'N/A'}
    
    Términos y Condiciones:
    ${(quotation as any).terms || 'Aplican las condiciones generales de ADE Travel.'}
  `;

  // Simulamos la creación de un archivo binario PDF
  return Buffer.from(content, "utf-8"); 
}