import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

// Fixed ids make the seed idempotent: running it twice changes nothing.
async function main() {
  await prisma.district.upsert({
    where: { id: "district-north" },
    update: {},
    create: { id: "district-north", name: "North District" },
  });
  await prisma.district.upsert({
    where: { id: "district-south" },
    update: {},
    create: { id: "district-south", name: "South District" },
  });
  await prisma.centre.upsert({
    where: { id: "centre-hyd" },
    update: {},
    create: { id: "centre-hyd", name: "Pragati Skills Centre, Hyderabad", districtId: "district-north" },
  });

  const people = [
    { id: "user-anika", name: "Anika", role: Role.CENTRE, centreId: "centre-hyd", districtId: "district-north" },
    { id: "user-dev", name: "Dev", role: Role.DISTRICT_OFFICER, districtId: "district-north" },
    { id: "user-meera", name: "Meera", role: Role.DISTRICT_OFFICER, districtId: "district-north" },
    { id: "user-kabir", name: "Kabir", role: Role.DISTRICT_OFFICER, districtId: "district-north" },
    { id: "user-neha", name: "Neha", role: Role.QUALITY },
    { id: "user-farah", name: "Farah", role: Role.STATE },
  ];
  for (const p of people) {
    await prisma.user.upsert({ where: { id: p.id }, update: {}, create: p });
  }
  console.log("seed done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
