import "dotenv/config";

import { disconnectSeedClient, seedDatabase } from "@/services/seed.service";

export { seedDatabase };

async function runCli() {
  console.log("🌱 Starting idempotent database seed...");
  await seedDatabase();
  console.log("✅ Seed completed successfully across all domain tables!");
}

runCli()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSeedClient();
  });
