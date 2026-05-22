/**
 * Cria tenant plataforma de desenvolvimento + usuário platform_admin (senha com bcrypt).
 * Uso: npm run seed:dev
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "../src/db";
import {
  ensurePlatformTenantSchema,
  setTenantType,
} from "../src/tenant-platform";
import { getOrCreateRoleId } from "../src/users";

const TENANT_ID =
  process.env.DEFAULT_LOGIN_TENANT_ID?.trim() ||
  "00000000-0000-4000-8000-000000000001";
const EMAIL = process.env.SEED_ADMIN_EMAIL?.trim() || "admin@local.dev";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "AdminDev123!";
const DISPLAY_NAME =
  process.env.SEED_ADMIN_NAME?.trim() || "Administrador plataforma (dev)";

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

async function main() {
  await ensurePlatformTenantSchema();
  const hash = await bcrypt.hash(PASSWORD, 10);
  const client = await pool.connect();

  try {
    const tenantRow = await client.query(
      `SELECT id FROM tenants WHERE id = $1::uuid`,
      [TENANT_ID]
    );
    if (tenantRow.rows.length === 0) {
      await client.query(
        `INSERT INTO tenants (id, name, slug, plan, is_active, max_users, max_flows, tenant_type)
         VALUES ($1::uuid, $2, $3, $4, true, 100, 500, 'platform')`,
        [TENANT_ID, "ClientOn Platform", "platform", "mvp"]
      );
    } else {
      await client.query(
        `UPDATE tenants SET is_active = true, name = $2, slug = $3, plan = $4, tenant_type = 'platform'
         WHERE id = $1::uuid`,
        [TENANT_ID, "ClientOn Platform", "platform", "mvp"]
      );
    }
    await setTenantType(TENANT_ID, "platform", "ClientOn Platform");

    if (!(await tableExists(client, "roles"))) {
      console.warn("Tabela 'roles' não encontrada.");
      process.exit(1);
    }

    const roleId = await getOrCreateRoleId(TENANT_ID, "platform_admin");
    const roleNullable = await columnNullable(client, "users", "role_id");

    await client.query(
      `DELETE FROM users WHERE email = $1 AND tenant_id = $2::uuid`,
      [EMAIL.toLowerCase(), TENANT_ID]
    );

    if (roleId) {
      await client.query(
        `INSERT INTO users (id, email, name, password_hash, tenant_id, role_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, $5::uuid)`,
        [EMAIL.toLowerCase(), DISPLAY_NAME, hash, TENANT_ID, roleId]
      );
    } else if (roleNullable) {
      await client.query(
        `INSERT INTO users (id, email, name, password_hash, tenant_id, role_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::uuid, NULL)`,
        [EMAIL.toLowerCase(), DISPLAY_NAME, hash, TENANT_ID]
      );
    } else {
      throw new Error("Não foi possível criar usuário platform_admin.");
    }

    console.log("Seed concluído (tenant plataforma + platform_admin).");
    console.log("  Tenant ID:", TENANT_ID);
    console.log("  Tipo: platform");
    console.log("  Email:", EMAIL);
    console.log("  Senha:", PASSWORD);
    console.log("  Perfil: platform_admin");
    console.log(
      "\nDEFAULT_LOGIN_TENANT_ID=" + TENANT_ID + " (opcional após login por e-mail único)"
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
