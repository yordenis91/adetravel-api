import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Nomencladores (país, ciudad, región, nacionalidad, tipo/marca/modelo de auto). Alimentan los
// combobox de sugerencia del frontend (ver Fase 5) — no son exhaustivos, cubren los destinos y
// orígenes usados por seed-clients.ts/seed-providers.ts/seed-flow.ts más algunos adicionales
// comunes para una agencia chilena.

const COUNTRIES_WITH_CITIES: Record<string, string[]> = {
  Chile: [
    "Santiago", "Valparaíso", "Concepción", "Puerto Montt", "Temuco", "Valdivia",
    "La Serena", "Antofagasta", "Osorno", "Puerto Natales", "Puerto Varas", "Iquique",
  ],
  Argentina: ["Buenos Aires", "Mendoza", "Bariloche", "Córdoba"],
  "Perú": ["Lima", "Cusco", "Arequipa"],
  "México": ["Ciudad de México", "Cancún", "Guadalajara"],
  Colombia: ["Bogotá", "Cartagena", "Medellín"],
  Uruguay: ["Montevideo", "Punta del Este"],
  Bolivia: ["La Paz", "Santa Cruz"],
  Ecuador: ["Quito", "Guayaquil"],
  Venezuela: ["Caracas"],
  Brasil: ["Río de Janeiro", "São Paulo"],
  "Estados Unidos": ["Miami", "Nueva York", "Los Ángeles"],
  "España": ["Madrid", "Barcelona"],
  Francia: ["París"],
  Italia: ["Roma", "Venecia"],
};

const CHILE_REGIONS = [
  "Región Metropolitana", "Valparaíso", "Biobío", "Los Lagos", "La Araucanía",
  "Coquimbo", "Antofagasta", "Los Ríos", "Magallanes y la Antártica Chilena",
];

const NATIONALITIES = [
  "Chilena", "Chileno", "Argentina", "Peruano", "Peruana", "Colombiana",
  "Boliviano", "Boliviana", "Ecuatoriana", "Uruguayo", "Uruguaya", "Venezolana",
  "Brasileña", "Mexicana", "Estadounidense", "Española", "Francesa",
];

const CAR_TYPES = ["Económico", "Compacto", "Intermedio", "SUV", "Van/Minivan", "Camioneta", "Furgón", "Lujo"];

const CAR_BRANDS_WITH_MODELS: Record<string, string[]> = {
  Toyota: ["Yaris", "Corolla", "RAV4", "Hilux"],
  Chevrolet: ["Spark", "Sail", "Tracker"],
  Hyundai: ["i10", "Accent", "Tucson"],
  Kia: ["Picanto", "Rio", "Sportage"],
  Nissan: ["March", "Versa", "X-Trail"],
  Suzuki: ["Swift", "Vitara"],
  Ford: ["Fiesta", "EcoSport"],
  Peugeot: ["208", "2008"],
};

async function main() {
  console.log("🌱 Iniciando seed de nomencladores...");

  for (const [countryName, cities] of Object.entries(COUNTRIES_WITH_CITIES)) {
    const country = await prisma.country.upsert({
      where: { name: countryName },
      update: {},
      create: { name: countryName },
    });
    console.log(`✅ País: ${country.name}`);

    for (const cityName of cities) {
      const existing = await prisma.city.findFirst({ where: { name: cityName, countryId: country.id } });
      if (existing) continue;
      await prisma.city.create({ data: { name: cityName, countryId: country.id } });
    }
    console.log(`   ↳ ${cities.length} ciudades`);
  }

  const chile = await prisma.country.findUnique({ where: { name: "Chile" } });
  if (chile) {
    for (const regionName of CHILE_REGIONS) {
      const existing = await prisma.region.findFirst({ where: { name: regionName, countryId: chile.id } });
      if (existing) continue;
      await prisma.region.create({ data: { name: regionName, countryId: chile.id } });
    }
    console.log(`✅ ${CHILE_REGIONS.length} regiones de Chile`);
  }

  for (const name of NATIONALITIES) {
    await prisma.nationality.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`✅ ${NATIONALITIES.length} nacionalidades`);

  for (const name of CAR_TYPES) {
    await prisma.carType.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`✅ ${CAR_TYPES.length} tipos de auto`);

  for (const [brandName, models] of Object.entries(CAR_BRANDS_WITH_MODELS)) {
    const brand = await prisma.carBrand.upsert({ where: { name: brandName }, update: {}, create: { name: brandName } });
    for (const modelName of models) {
      const existing = await prisma.carModel.findFirst({ where: { name: modelName, carBrandId: brand.id } });
      if (existing) continue;
      await prisma.carModel.create({ data: { name: modelName, carBrandId: brand.id } });
    }
  }
  console.log(`✅ ${Object.keys(CAR_BRANDS_WITH_MODELS).length} marcas de auto con sus modelos`);

  console.log("🎉 Seed de nomencladores completado");
}

main()
  .catch((error) => {
    console.error("❌ Error durante seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
