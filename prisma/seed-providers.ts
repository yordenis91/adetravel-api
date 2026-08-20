import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { createActivityLog } from "../src/services/activity-log.service";
import { getAdminUser } from "./seed-helpers";

const providers = [
  {
    name: "HERTZ CHILE S.A.",
    fantasyName: "Hertz Rent a Car",
    rut: "78.123.456-5",
    country: "Chile",
    city: "Santiago",
    address: "Av. Libertador Bernardo O'Higgins 1449, Santiago",
    phone: "+56 2 2690 3000",
    email: "reservas@hertz.cl",
    businessType: "RENT_A_CAR",
    executiveName: "Carlos Rodríguez García",
    executivePhone: "+56 9 8765 4321",
    executiveEmail: "carlos.rodriguez@hertz.cl",
    contactName: "María González López",
    contactPhone: "+56 9 8765 4322",
    contactEmail: "maria.gonzalez@hertz.cl",
    contactRut: "12.345.678-9",
    bankAccount: "123456789",
    bankName: "Banco de Chile",
    bankAccountHolder: "HERTZ CHILE S.A.",
    paymentMethod: "TRANSFER",
    vatPercentage: 19,
    isActive: true,
  },
  {
    name: "EXPLORA PATAGONIA LTDA.",
    fantasyName: "Explora Patagonia",
    rut: "79.456.789-2",
    country: "Chile",
    city: "Puerto Natales",
    address: "Calle Seno Ultima Esperanza 123, Puerto Natales",
    phone: "+56 61 2291 4000",
    email: "reservas@explorapatagonia.com",
    businessType: "TOUR_OPERATOR",
    executiveName: "Roberto Silva Martínez",
    executivePhone: "+56 9 9876 5432",
    executiveEmail: "roberto.silva@explorapatagonia.com",
    contactName: "Andrea Vargas Delgado",
    contactPhone: "+56 9 9876 5433",
    contactEmail: "andrea.vargas@explorapatagonia.com",
    contactRut: "15.789.123-4",
    bankAccount: "987654321",
    bankName: "Banco Santander",
    bankAccountHolder: "EXPLORA PATAGONIA LTDA.",
    paymentMethod: "TRANSFER",
    vatPercentage: 19,
    isActive: true,
  },
  {
    name: "SEGUROS FALABELLA S.A.",
    fantasyName: "SEGUROS FALABELLA",
    rut: "80.987.654-1",
    country: "Chile",
    city: "Santiago",
    address: "Av. Apoquindo 3000, Las Condes, Santiago",
    phone: "+56 2 2495 2000",
    email: "viajes@segurosfalabella.cl",
    businessType: "INSURANCE",
    executiveName: "Fernando Jiménez Pérez",
    executivePhone: "+56 9 7654 3210",
    executiveEmail: "fernando.jimenez@segurosfalabella.cl",
    contactName: "Claudia Morales Cruz",
    contactPhone: "+56 9 7654 3211",
    contactEmail: "claudia.morales@segurosfalabella.cl",
    contactRut: "18.456.789-3",
    bankAccount: "555666777",
    bankName: "BCI",
    bankAccountHolder: "SEGUROS FALABELLA S.A.",
    paymentMethod: "WEBPAY",
    vatPercentage: 19,
    isActive: true,
  },
  {
    name: "HOTEL ENJOY CONCEPCIÓN",
    fantasyName: "Enjoy Concepción",
    rut: "81.234.567-8",
    country: "Chile",
    city: "Concepción",
    address: "Avenida Costanera 2500, Concepción",
    phone: "+56 41 2320 0000",
    email: "info@enjoyhotel.cl",
    businessType: "HOTEL",
    executiveName: "Lorena Fuentes Soto",
    executivePhone: "+56 9 6543 2109",
    executiveEmail: "lorena.fuentes@enjoyhotel.cl",
    contactName: "Diego Araya Flores",
    contactPhone: "+56 9 6543 2110",
    contactEmail: "diego.araya@enjoyhotel.cl",
    contactRut: "16.789.456-2",
    bankAccount: "111222333",
    bankName: "Itaú",
    bankAccountHolder: "HOTEL ENJOY CONCEPCIÓN",
    paymentMethod: "TRANSFER",
    vatPercentage: 19,
    isActive: true,
  },
  {
    name: "RESTAURANT ÑOÑO & CIA",
    fantasyName: "Ñoño Marino",
    rut: "82.567.891-3",
    country: "Chile",
    city: "Valparaíso",
    address: "Calle Templeman 45, Cerro Concepción, Valparaíso",
    phone: "+56 32 2262 8900",
    email: "reservas@nonomarino.cl",
    businessType: "RESTAURANT",
    executiveName: "Gustavo Peña Reyes",
    executivePhone: "+56 9 5432 1098",
    executiveEmail: "gustavo.pena@nonomarino.cl",
    contactName: "Patricia Medina Ruiz",
    contactPhone: "+56 9 5432 1099",
    contactEmail: "patricia.medina@nonomarino.cl",
    contactRut: "17.123.456-7",
    bankAccount: "444555666",
    bankName: "Banco Estado",
    bankAccountHolder: "RESTAURANT ÑOÑO & CIA",
    paymentMethod: "CASH",
    vatPercentage: 19,
    isActive: true,
  },
  {
    name: "LATAM AIRLINES GROUP S.A.",
    fantasyName: "LATAM Airlines",
    rut: "83.345.678-9",
    country: "Chile",
    city: "Santiago",
    address: "Av. Presidente Riesco 5711, Las Condes, Santiago",
    phone: "+56 2 2565 1010",
    email: "reservas.corporativo@latam.com",
    businessType: "AIRLINE",
    executiveName: "Ignacio Torres Bravo",
    executivePhone: "+56 9 4321 0987",
    executiveEmail: "ignacio.torres@latam.com",
    contactName: "Valentina Rojas Muñoz",
    contactPhone: "+56 9 4321 0988",
    contactEmail: "valentina.rojas@latam.com",
    contactRut: "19.234.567-8",
    bankAccount: "888999000",
    bankName: "Banco de Chile",
    bankAccountHolder: "LATAM AIRLINES GROUP S.A.",
    paymentMethod: "TRANSFER",
    vatPercentage: 19,
    isActive: true,
  },
  {
    name: "TRASLADOS Y EXCURSIONES DEL SUR SPA",
    fantasyName: "Traslados del Sur",
    rut: "84.456.789-0",
    country: "Chile",
    city: "Puerto Varas",
    address: "Camino a Ensenada Km 5, Puerto Varas",
    phone: "+56 65 223 3456",
    email: "reservas@trasladosdelsur.cl",
    businessType: "TOURIST_SERVICES",
    executiveName: "Matías Contreras Leiva",
    executivePhone: "+56 9 3210 9876",
    executiveEmail: "matias.contreras@trasladosdelsur.cl",
    contactName: "Javiera Sepúlveda Ortiz",
    contactPhone: "+56 9 3210 9877",
    contactEmail: "javiera.sepulveda@trasladosdelsur.cl",
    contactRut: "20.345.678-9",
    bankAccount: "112233445",
    bankName: "Banco Estado",
    bankAccountHolder: "TRASLADOS Y EXCURSIONES DEL SUR SPA",
    paymentMethod: "TRANSFER",
    vatPercentage: 19,
    isActive: true,
  },
];

async function main() {
  console.log("🌱 Iniciando seed de proveedores...");

  // Igual que Clientes: se registran "como si los hubiera cargado el administrador"
  // (createdBy + Bitácora), reflejando el flujo real de la UI de Proveedores.
  const admin = await getAdminUser();

  for (const provider of providers) {
    const existingProvider = await prisma.provider.findFirst({
      where: { rut: provider.rut },
    });

    if (existingProvider) {
      console.log(`✓ Proveedor ya existe: ${provider.name} (RUT: ${provider.rut})`);
      continue;
    }

    const created = await prisma.provider.create({
      data: {
        ...provider,
        createdBy: admin.id,
      },
    });

    await createActivityLog({
      action: "CREATE",
      entityType: "Provider",
      entityId: created.id,
      entityLabel: created.name,
      description: "Proveedor registrado",
      performedBy: admin.id,
    });

    console.log(`✅ Proveedor creado: ${created.name} (ID: ${created.id})`);
  }

  console.log("🎉 Seed de proveedores completado");
}

main()
  .catch((error) => {
    console.error("❌ Error durante seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
