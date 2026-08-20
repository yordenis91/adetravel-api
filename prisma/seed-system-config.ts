import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// SystemConfig es un singleton (el resto del backend hace `prisma.systemConfig.findFirst()`
// y cae a valores por defecto si no hay fila) — sin esta seed la agencia "no tiene nombre" en
// PDFs/emails y el widget de tasas de cambio del Dashboard queda vacío.
async function main() {
  console.log("🌱 Iniciando seed de configuración del sistema...");

  const existing = await prisma.systemConfig.findFirst();
  if (existing) {
    console.log("✓ Ya existe una configuración del sistema, no se modifica.");
    return;
  }

  const created = await prisma.systemConfig.create({
    data: {
      agencyName: "ADE Travel Ltda.",
      agencyFantasyName: "ADE Travel",
      agencyRut: "76.543.210-K",
      agencyAddress: "Av. Providencia 1208, Oficina 502, Providencia, Santiago",
      agencyPhone: "+56 2 2345 6789",
      agencyEmail: "contacto@adetravel.cl",
      agencyWebsite: "https://www.adetravel.cl",
      notifyOnQuotationSent: true,
      notifyOnPaymentCompleted: true,
      notifyOnVoucherIssued: true,
      notifyOnRequestCreated: false,
      defaultCurrency: "CLP",
      defaultTaxPercentage: 19,
      defaultQuotationValidityDays: 15,
      defaultTermsAndConditions:
        "Los precios están sujetos a disponibilidad al momento de la confirmación. La reserva se garantiza únicamente con el pago del abono correspondiente dentro del plazo indicado.",
      defaultQuotationNotes: "Gracias por confiar en ADE Travel. Quedamos atentos a cualquier consulta.",
      requestNumberPrefix: "ADET",
      quotationNumberPrefix: "COTIZ",
      paymentNumberPrefix: "PAG",
      voucherNumberPrefix: "VCH",
      serviceNumberPrefix: "SRV",
      confirmationNumberPrefix: "CONF",
      timezone: "America/Santiago",
      exchangeRates: JSON.stringify([
        { currency: "USD", rate: 950, updatedAt: new Date().toISOString() },
        { currency: "EUR", rate: 1030, updatedAt: new Date().toISOString() },
      ]),
    },
  });

  console.log(`✅ Configuración del sistema creada (ID: ${created.id})`);
  console.log("🎉 Seed de configuración completado");
}

main()
  .catch((error) => {
    console.error("❌ Error durante seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
