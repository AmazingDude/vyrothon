/// <reference types="node" />
import "dotenv/config";

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Pooled URL — used by the app at runtime (pgBouncer, port 6543)
    url: process.env["DATABASE_URL"],
  },
});
