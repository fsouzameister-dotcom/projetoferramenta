/**
 * Cria tenant de desenvolvimento + usuário admin (senha com bcrypt).
 * Uso: npm run seed:dev
 *
 * Variáveis opcionais (ver .env.example):
 * DEFAULT_LOGIN_TENANT_ID, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "../src/db";

const TENANT_ID =
  process.env.DEFAULT_LOGIN_TENANT_ID?.trim() ||
  "00000000-0000-4000-8000-000000000001";
const EMAIL = process.env.SEED_ADMIN_EMAIL?.trim() || "admin@local.dev";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "AdminDev123!";
const DISPLAY_NAME =
  process.env.SEED_ADMIN_NAME?.trim() || "Administrador (dev)";

async function tableExists(client: import("pg").PoolClient, name: string) {
  const r = await client.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS ok`,
    [name]
  );
  return Boolean(r.rows[0]?.ok);
}

async function columnNullable(
  client: import("pg").PoolClient,
  table: string,
  col: string
) {
  const r = await client.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, col]
  );
  return r.rows[0]?.is_nullable === "YES";
}

async function resolveRoleId(
  client: import("pg").PoolClient,
  tenantId: string
): Promise<string | null> {
  if (!(await tableExists(client, "roles"))) {
    console.warn(
      "Tabela 'roles' não encontrada; tentando usuário sem role_id (se permitido)."
    );
    return null;
  }

  const existing = await client.query(
    `SELECT id FROM roles WHERE tenant_id = $1::uuid LIMIT 1`,
    [tenantId]
  );
  if (existing.rows.length > 0) {
    return String(existing.rows[0].id);
  }

  const ins = await client.query(
    `INSERT INTO roles (id, tenant_id, name)
     VALUES (gen_random_uuid(), $1::uuid, 'admin')
     RETURNING id`,
    [tenantId]
  );
  return String(ins.rows[0].id);
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const client = await pool.connect();

  try {
    const tenantRow = await client.query(
      `SELECT id FROM tenants WHERE id = $1::uuid`,
      [TENANT_ID]
    );
    if (tenantRow.rows.length === 0) {
      await client.query(
        `INSERT INTO tenants (id, name, slug, plan, is_active, max_users, max_flows)
         VALUES ($1::uuid, $2, $3, $4, true, 100, 500)`,
        [TENANT_ID, "Tenant Dev", "dev", "mvp"]
      );
    } else {
      await client.query(
        `UPDATE tenants SET is_active = true, name = $2, slug = $3, plan = $4 WHERE id = $1::uuid`,
        [TENANT_ID, "Tenant Dev", "dev", "mvp"]
      );
    }

    const roleId = await resolveRoleId(client, TENANT_ID);
    const roleNullable = await columnNullable(client, "users", "role_id");

    await client.query(
      `DELETE FROM users WHERE email = $1 AND tenant_id = $2::uuid`,
      [EMAIL, TENANT_ID]
    );

    if (roleId) {
      await client.query(
        `INSERT INTO users (id, email, name, password_hash, tenant_id, role_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, $5::uuid)`,
        [EMAIL, DISPLAY_NAME, hash, TENANT_ID, roleId]
      );
    } else if (roleNullable) {
      await client.query(
        `INSERT INTO users (id, email, name, password_hash, tenant_id, role_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, NULL)`,
        [EMAIL, DISPLAY_NAME, hash, TENANT_ID]
      );
    } else {
      throw new Error(
        "Não foi possível obter role_id e a coluna users.role_id não aceita NULL. Verifique a tabela roles."
      );
    }

    console.log("Seed concluído.");
    console.log("  Tenant ID (use no .env como DEFAULT_LOGIN_TENANT_ID):", TENANT_ID);
    console.log("  Email:", EMAIL);
    console.log("  Senha:", PASSWORD);
    console.log(
      "\nAdicione ao mvp-fluxo-backend/.env se ainda não existir:\n  DEFAULT_LOGIN_TENANT_ID=" +
        TENANT_ID
    );
  } catch (e) {
    console.error("Erro no seed:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
