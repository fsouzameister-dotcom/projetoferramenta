/**
 * Aplica migrations SQL em ordem (pasta migrations/).
 * Uso: npm run migrate
 * Requer DATABASE_URL ou variáveis PG* do .env (via dotenv no server).
 */
import "dotenv/config";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../src/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function ensureMigrationsTable(client: Awaited<ReturnType<typeof pool.connect>>) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedVersions(client: Awaited<ReturnType<typeof pool.connect>>): Promise<Set<string>> {
  const res = await client.query<{ version: string }>(`SELECT version FROM schema_migrations`);
  return new Set(res.rows.map((r) => r.version));
}

async function main() {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("Nenhuma migration encontrada.");
    return;
  }

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const done = await appliedVersions(client);

    for (const file of files) {
      if (done.has(file)) {
        console.log(`skip ${file}`);
        continue;
      }
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      console.log(`apply ${file}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [file]);
        await client.query("COMMIT");
        console.log(`ok ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log("Migrations concluídas.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
