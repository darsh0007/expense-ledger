import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` (and the Prisma pg adapter) are Node-only packages that must NOT be
  // bundled into the server build — keep them as real runtime requires.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default nextConfig;
