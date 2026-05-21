// src/services/pdf.service.ts
import { QuotationItem } from "./quotation.calc";

export function buildQuotationHtml(data: any): string {
  const itemsRows = data.items.map((item: QuotationItem) => `
    <tr>
      <td class="item-service">${item.service}</td>
      <td class="item-desc">${item.description}</td>
      <td class="item-qty center">${item.quantity}</td>
      <td class="item-price right">${data.currency} ${item.unitPrice.toLocaleString("es-CL")}</td>
      <td class="item-total right">${data.currency} ${item.total.toLocaleString("es-CL")}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Cotización ${data.quotationNumber}</title>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1a2e; padding: 40px; font-size: 12px; }
    .header { border-bottom: 3px solid #0F1E3C; padding-bottom: 24px; margin-bottom: 40px; display: flex; justify-content: space-between; }
    .agency-name { font-size: 18px; font-weight: bold; color: #0F1E3C; }
    .doc-title { font-size: 26px; font-weight: 800; color: #0F1E3C; }
    .doc-number { color: #C9A84C; font-size: 14px; font-weight: bold; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #0F1E3C; color: #fff; padding: 10px; text-align: left; font-size: 10px; text-transform: uppercase; }
    td { padding: 10px; border-bottom: 1px solid #eee; }
    .right { text-align: right; } .center { text-align: center; }
    .totals-table { width: 300px; float: right; }
    .total-row { background: #0F1E3C; color: #fff; font-weight: bold; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <div><div class="agency-name">ADE Travel</div><br>RUT: 76.XXX.XXX-X</div>
    <div style="text-align:right">Fecha: ${new Date().toLocaleDateString("es-CL")}</div>
  </div>
  <div class="doc-title">Cotización de Servicios</div>
  <div class="doc-number">${data.quotationNumber}</div>
  <p><strong>Cliente:</strong> ${data.client.firstName} ${data.client.lastName}</p>
  <br>
  <table>
    <thead><tr><th>Servicio</th><th>Descripción</th><th class="center">Cant.</th><th class="right">P. Unit.</th><th class="right">Total</th></tr></thead>
    <tbody>${itemsRows}</tbody>
  </table>
  <table class="totals-table">
    <tr><td>Subtotal</td><td class="right">${data.currency} ${data.subtotal.toLocaleString("es-CL")}</td></tr>
    <tr><td>IVA (${data.taxPercentage}%)</td><td class="right">${data.currency} ${data.taxAmount.toLocaleString("es-CL")}</td></tr>
    <tr class="total-row"><td>TOTAL</td><td class="right">${data.currency} ${data.total.toLocaleString("es-CL")}</td></tr>
  </table>
  <div style="clear:both"></div>
  ${data.notes ? `<h4>Notas</h4><p>${data.notes}</p>` : ''}
</body>
</html>`;
}