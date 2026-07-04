import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Pool singleton — sobrevive ao hot-reload do dev server (padrão Next.js).
const globalForDb = globalThis as unknown as { __w4yPool?: Pool };

function getPool(): Pool {
  if (!globalForDb.__w4yPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada (.env.local)");
    globalForDb.__w4yPool = new Pool({ connectionString: url, max: 5 });
  }
  return globalForDb.__w4yPool;
}

export function db() {
  return drizzle(getPool(), { schema });
}

export * from "./schema";
