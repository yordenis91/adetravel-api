import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Nomencladores (país, ciudad, región, nacionalidad, tipo/marca/modelo de auto). Alimentan los
// combobox de sugerencia del frontend — no son exhaustivos: cubren los destinos y orígenes de una
// agencia chilena (Chile, vecinos, Sudamérica, Caribe/Norteamérica, Europa y Asia/Oceanía) más lo
// usado por seed-clients.ts/seed-providers.ts/seed-flow.ts. Es idempotente (upsert / findFirst).

const COUNTRIES_WITH_CITIES: Record<string, string[]> = {
  Chile: [
    "Santiago", "Valparaíso", "Viña del Mar", "Concepción", "Puerto Montt", "Temuco", "Valdivia",
    "La Serena", "Coquimbo", "Antofagasta", "Calama", "San Pedro de Atacama", "Osorno", "Puerto Natales",
    "Punta Arenas", "Puerto Varas", "Frutillar", "Pucón", "Villarrica", "Iquique", "Arica", "Copiapó",
    "Rancagua", "Talca", "Chillán", "Los Ángeles", "Coyhaique", "Castro", "Ancud", "Pichilemu",
    "Isla de Pascua", "Puerto Williams", "Colchagua (Santa Cruz)", "Pisco Elqui", "Zapallar", "Algarrobo",
  ],
  Argentina: [
    "Buenos Aires", "Mendoza", "Bariloche", "Córdoba", "Salta", "Ushuaia",
    "El Calafate", "El Chaltén", "Puerto Iguazú", "Rosario", "Mar del Plata", "San Martín de los Andes",
    "Villa La Angostura", "San Juan", "Tucumán", "Jujuy", "Purmamarca", "Puerto Madryn", "Neuquén", "Villa Carlos Paz",
  ],
  "Perú": [
    "Lima", "Cusco", "Arequipa", "Machu Picchu", "Aguas Calientes", "Puno", "Iquitos", "Paracas",
    "Ica", "Trujillo", "Chiclayo", "Piura", "Máncora", "Huaraz", "Ollantaytambo", "Nazca",
  ],
  Bolivia: ["La Paz", "Santa Cruz", "Sucre", "Uyuni", "Cochabamba", "Copacabana", "Potosí", "Oruro"],
  Brasil: [
    "Río de Janeiro", "São Paulo", "Florianópolis", "Salvador", "Foz do Iguaçu", "Búzios", "Fortaleza",
    "Recife", "Natal", "Maceió", "Brasilia", "Porto Alegre", "Armação dos Búzios", "Porto de Galinhas",
    "Camboriú", "Curitiba", "Manaos",
  ],
  Uruguay: ["Montevideo", "Punta del Este", "Colonia del Sacramento", "Piriápolis", "Cabo Polonio"],
  Paraguay: ["Asunción", "Ciudad del Este", "Encarnación"],
  Colombia: ["Bogotá", "Cartagena", "Medellín", "Cali", "Santa Marta", "San Andrés", "Barranquilla", "Pereira"],
  Ecuador: ["Quito", "Guayaquil", "Cuenca", "Galápagos (Puerto Ayora)", "Baños"],
  Venezuela: ["Caracas", "Isla Margarita", "Mérida"],
  Panamá: ["Ciudad de Panamá", "Bocas del Toro", "Colón"],
  "Costa Rica": ["San José", "Liberia", "Tamarindo", "La Fortuna"],
  Cuba: ["La Habana", "Varadero", "Santiago de Cuba"],
  "República Dominicana": ["Punta Cana", "Santo Domingo", "Puerto Plata", "La Romana"],
  "México": ["Ciudad de México", "Cancún", "Playa del Carmen", "Guadalajara", "Tulum", "Los Cabos", "Puerto Vallarta", "Oaxaca", "Mérida"],
  "Estados Unidos": [
    "Miami", "Orlando", "Nueva York", "Los Ángeles", "Las Vegas", "San Francisco", "Washington D.C.",
    "Chicago", "Houston", "Dallas", "Boston", "Honolulu", "Nueva Orleans",
  ],
  "Canadá": ["Toronto", "Vancouver", "Montreal", "Calgary", "Quebec"],
  Aruba: ["Oranjestad"],
  Bahamas: ["Nassau"],
  Jamaica: ["Montego Bay", "Kingston"],
  "España": ["Madrid", "Barcelona", "Sevilla", "Valencia", "Málaga", "Palma de Mallorca", "Ibiza", "Bilbao", "Santiago de Compostela", "Tenerife"],
  Portugal: ["Lisboa", "Oporto", "Faro", "Funchal"],
  Francia: ["París", "Niza", "Lyon", "Marsella", "Burdeos"],
  Italia: ["Roma", "Venecia", "Milán", "Florencia", "Nápoles", "Turín", "Bolonia", "Palermo"],
  Alemania: ["Berlín", "Múnich", "Fráncfort", "Hamburgo", "Colonia"],
  "Reino Unido": ["Londres", "Edimburgo", "Manchester", "Liverpool"],
  Irlanda: ["Dublín"],
  "Países Bajos": ["Ámsterdam", "Róterdam"],
  "Bélgica": ["Bruselas", "Brujas"],
  Suiza: ["Zúrich", "Ginebra", "Lucerna"],
  Austria: ["Viena", "Salzburgo"],
  Grecia: ["Atenas", "Santorini", "Mykonos"],
  "Turquía": ["Estambul", "Capadocia", "Antalya"],
  "República Checa": ["Praga"],
  Hungría: ["Budapest"],
  Polonia: ["Varsovia", "Cracovia"],
  Croacia: ["Dubrovnik", "Split", "Zagreb"],
  Rusia: ["Moscú", "San Petersburgo"],
  Islandia: ["Reikiavik"],
  "Emiratos Árabes Unidos": ["Dubái", "Abu Dabi"],
  Egipto: ["El Cairo", "Luxor", "Sharm el-Sheij"],
  Marruecos: ["Marrakech", "Casablanca"],
  Sudáfrica: ["Ciudad del Cabo", "Johannesburgo"],
  Israel: ["Tel Aviv", "Jerusalén"],
  "Japón": ["Tokio", "Kioto", "Osaka"],
  "Corea del Sur": ["Seúl", "Busan"],
  China: ["Pekín", "Shanghái", "Hong Kong"],
  Tailandia: ["Bangkok", "Phuket", "Chiang Mai"],
  India: ["Nueva Delhi", "Bombay", "Agra"],
  Indonesia: ["Bali (Denpasar)", "Yakarta"],
  Singapur: ["Singapur"],
  Maldivas: ["Malé"],
  Australia: ["Sídney", "Melbourne", "Brisbane"],
  "Nueva Zelanda": ["Auckland", "Queenstown", "Wellington"],
  "Polinesia Francesa": ["Papeete", "Bora Bora"],
};

const REGIONS_BY_COUNTRY: Record<string, string[]> = {
  Chile: [
    "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo", "Valparaíso",
    "Región Metropolitana", "O'Higgins", "Maule", "Ñuble", "Biobío", "La Araucanía", "Los Ríos",
    "Los Lagos", "Aysén", "Magallanes y la Antártica Chilena",
  ],
  Argentina: [
    "Buenos Aires", "Ciudad Autónoma de Buenos Aires", "Córdoba", "Mendoza", "Salta", "Jujuy", "Tucumán",
    "Neuquén", "Río Negro", "Chubut", "Santa Cruz", "Tierra del Fuego", "Misiones", "Santa Fe", "San Juan",
  ],
  "Perú": ["Lima", "Cusco", "Arequipa", "Puno", "Loreto", "Ica", "La Libertad", "Áncash", "Piura", "Tumbes"],
  Bolivia: ["La Paz", "Santa Cruz", "Potosí", "Chuquisaca", "Cochabamba"],
  Brasil: ["Río de Janeiro", "São Paulo", "Bahía", "Santa Catarina", "Paraná", "Ceará", "Pernambuco"],
};

// Gentilicio masculino / femenino. Si es invariable (p. ej. "Estadounidense") se repite el mismo.
const NATIONALITY_PAIRS: [string, string][] = [
  ["Chileno", "Chilena"], ["Argentino", "Argentina"], ["Peruano", "Peruana"], ["Boliviano", "Boliviana"],
  ["Brasileño", "Brasileña"], ["Uruguayo", "Uruguaya"], ["Paraguayo", "Paraguaya"], ["Colombiano", "Colombiana"],
  ["Ecuatoriano", "Ecuatoriana"], ["Venezolano", "Venezolana"], ["Panameño", "Panameña"],
  ["Costarricense", "Costarricense"], ["Cubano", "Cubana"], ["Dominicano", "Dominicana"],
  ["Mexicano", "Mexicana"], ["Estadounidense", "Estadounidense"], ["Canadiense", "Canadiense"],
  ["Español", "Española"], ["Portugués", "Portuguesa"], ["Francés", "Francesa"], ["Italiano", "Italiana"],
  ["Alemán", "Alemana"], ["Británico", "Británica"], ["Irlandés", "Irlandesa"], ["Neerlandés", "Neerlandesa"],
  ["Belga", "Belga"], ["Suizo", "Suiza"], ["Austriaco", "Austriaca"], ["Griego", "Griega"], ["Turco", "Turca"],
  ["Ruso", "Rusa"], ["Polaco", "Polaca"], ["Croata", "Croata"], ["Sueco", "Sueca"], ["Noruego", "Noruega"],
  ["Danés", "Danesa"], ["Japonés", "Japonesa"], ["Chino", "China"], ["Coreano", "Coreana"],
  ["Indio", "India"], ["Australiano", "Australiana"], ["Neozelandés", "Neozelandesa"],
  ["Israelí", "Israelí"], ["Sudafricano", "Sudafricana"], ["Egipcio", "Egipcia"], ["Marroquí", "Marroquí"],
  ["Haitiano", "Haitiana"],
];
const NATIONALITIES = Array.from(new Set(NATIONALITY_PAIRS.flat()));

const CAR_TYPES = [
  "Económico", "Compacto", "Intermedio", "Sedán", "SUV", "SUV 4x4", "Camioneta", "Camioneta 4x4",
  "Van/Minivan", "Furgón", "Convertible", "Lujo", "Eléctrico/Híbrido", "Automático", "Mecánico",
];

const CAR_BRANDS_WITH_MODELS: Record<string, string[]> = {
  Toyota: ["Yaris", "Corolla", "RAV4", "Hilux", "Land Cruiser", "Corolla Cross", "Rush"],
  Chevrolet: ["Spark", "Sail", "Tracker", "Groove", "Onix", "D-Max", "Captiva"],
  Hyundai: ["i10", "Accent", "Tucson", "Creta", "Santa Fe", "Grand i10", "Elantra"],
  Kia: ["Morning", "Rio", "Sportage", "Soluto", "Seltos", "Sorento", "Carens"],
  Nissan: ["March", "Versa", "Kicks", "X-Trail", "Qashqai", "NP300", "Frontier"],
  Suzuki: ["Swift", "Vitara", "Baleno", "Jimny", "S-Presso", "Dzire"],
  Mazda: ["Mazda2", "Mazda3", "CX-3", "CX-5", "BT-50"],
  Mitsubishi: ["L200", "ASX", "Outlander", "Montero Sport", "Eclipse Cross"],
  Ford: ["Fiesta", "EcoSport", "Territory", "Ranger", "Explorer"],
  Peugeot: ["208", "2008", "3008", "Partner"],
  Citroën: ["C3", "C4 Cactus", "Berlingo"],
  Renault: ["Kwid", "Sandero", "Duster", "Captur", "Koleos"],
  Volkswagen: ["Gol", "Polo", "T-Cross", "Tiguan", "Amarok", "Virtus"],
  Honda: ["Fit", "City", "HR-V", "CR-V", "Civic"],
  Subaru: ["Impreza", "XV", "Forester", "Outback"],
  Jeep: ["Renegade", "Compass", "Wrangler"],
  "Mercedes-Benz": ["Clase A", "Clase C", "Vito", "Sprinter", "GLA"],
  BMW: ["Serie 3", "X1", "X3"],
  Chery: ["Tiggo 2", "Tiggo 4", "Tiggo 7", "Arrizo 5"],
  MG: ["MG3", "ZS", "HS"],
  JAC: ["JS2", "JS4", "T6"],
  "Great Wall": ["Poer"],
  Fiat: ["Mobi", "Argo", "Cronos", "Fiorino"],
  Opel: ["Corsa", "Astra", "Mokka"],
  Skoda: ["Fabia", "Octavia", "Kodiaq"],
  Tesla: ["Model 3", "Model Y"],
  BYD: ["Dolphin", "Yuan Plus", "Song Plus"],
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

  let regionCount = 0;
  for (const [countryName, regions] of Object.entries(REGIONS_BY_COUNTRY)) {
    const country = await prisma.country.findUnique({ where: { name: countryName } });
    if (!country) continue;
    for (const regionName of regions) {
      const existing = await prisma.region.findFirst({ where: { name: regionName, countryId: country.id } });
      if (existing) continue;
      await prisma.region.create({ data: { name: regionName, countryId: country.id } });
    }
    regionCount += regions.length;
  }
  console.log(`✅ ${regionCount} regiones/provincias/departamentos`);

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
