// Prisma 7 configuration file.
//
// In Prisma 7 the database connection URL moved OUT of schema.prisma and INTO
// this file. The CLI (migrate, validate, studio, db seed) reads everything from
// here. `import "dotenv/config"` loads variables from `.env` into process.env
// BEFORE Prisma reads them — without it, DATABASE_URL would be undefined.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // env() throws a clear error if DATABASE_URL is missing, which is what we
    // want for migrate/seed (they genuinely need a database).
    url: env("DATABASE_URL"),
  },
});
