import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { clientPiiExtension } from "./client-pii-extension";
import { servicePiiExtension } from "./service-pii-extension";
import { systemConfigExtension } from "./system-config-extension";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
export const prisma = new PrismaClient({ adapter }).$extends(clientPiiExtension).$extends(servicePiiExtension).$extends(systemConfigExtension);

  //if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;