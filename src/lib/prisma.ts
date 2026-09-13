import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { clientPiiExtension } from "./client-pii-extension";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
export const prisma = new PrismaClient({ adapter }).$extends(clientPiiExtension);

  //if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;