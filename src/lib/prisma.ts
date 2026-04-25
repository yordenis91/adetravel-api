import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
export const prisma = new PrismaClient({ adapter });

  //if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;