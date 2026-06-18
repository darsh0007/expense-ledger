// Single shared Prisma Client for the whole app.
//
// Prisma 7 connects through a "driver adapter" instead of a bundled query
// engine binary. We use `@prisma/adapter-pg`, which talks to Postgres via the
// battle-tested `pg` driver. The adapter receives the same DATABASE_URL.
//
// `import "dotenv/config"` ensures DATABASE_URL is loaded when this module is
// used from plain scripts (e.g. `tsx prisma/seed.ts`). In Next.js the env is
// already loaded, and importing this twice is harmless.
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// In dev, Next.js hot-reloads modules and would otherwise create a new client
// (and a new connection pool) on every reload. We cache one instance on
// globalThis to avoid exhausting Postgres connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
