import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// Local dev uses a plain SQLite file. On Vercel the filesystem is not persistent,
// so production uses Turso (hosted SQLite) through the libSQL driver adapter.
function make() {
  if (process.env.TURSO_DATABASE_URL) {
    const adapter = new PrismaLibSQL({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter });
  }
  return new PrismaClient();
}

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? make();
if (process.env.NODE_ENV !== "production") g.prisma = db;

export async function getSettings() {
  return db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
