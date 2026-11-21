import { PrismaClient } from "@prisma/client";
import { seedDemo } from "../src/demo-data";

const prisma = new PrismaClient();

// DEMO_SAMPLE_BATCHES=false starts with the six people only (clean demo recording).
seedDemo(prisma, { sampleBatches: process.env.DEMO_SAMPLE_BATCHES !== "false" })
  .then(() => console.log("seed done"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
