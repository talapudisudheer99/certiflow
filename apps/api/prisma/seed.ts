import { PrismaClient } from "@prisma/client";
import { seedDemo } from "../src/demo-data";

const prisma = new PrismaClient();

seedDemo(prisma)
  .then(() => console.log("seed done"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
