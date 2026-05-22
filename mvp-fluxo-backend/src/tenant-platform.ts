import bcrypt from "bcrypt";
import { pool } from "./db";
import { getOrCreateRoleId } from "./users";
import type { AppRole } from "./auth-roles";

export type TenantType = "platform" | "customer";

export type TenantSegment =
  | "pesquisa"
  | "atendimento"
  | "captacao"
  | "vendas"
  | "misto"
  | null;

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  max_users: number;
  max_flows: number;
  tenant_type: TenantType;
  segment: TenantSegment;
  created_at?: string;
};

let schemaReady: Promise<void> | null = null;

export function ensurePlatformTenantSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const client = await pool.connect();
      try {
        await client.query(`
          ALTER TABLE tenants
            ADD COLUMN IF NOT EXISTS tenant_type text NOT NULL DEFAULT 'customer';
        `);
        await client.query(`
          ALTER TABLE tenants
            ADD COLUMN IF NOT EXISTS segment text;
        `);
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
            ON users (LOWER(email));
        `);
      } finally {
        client.release();
      }
    })();
  }
  return schemaReady;
}

export async function getTenantById(tenantId: string): Promise<TenantRow | null> {
  await ensurePlatformTenantSchema();
  const client = await pool.connect();
  try {
    const result = await client.query<TenantRow>(
      `SELECT id, name, slug, plan, is_active, max_users, max_flows,
              COALESCE(tenant_type, 'customer') AS tenant_type,
              segment
       FROM tenants WHERE id = $1`,
      [tenantId]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

export async function setTenantType(
  tenantId: string,
  tenantType: TenantType,
  name?: string
): Promise<void> {
  await ensurePlatformTenantSchema();
  const client = await pool.connect();
  try {
    if (name) {
      await client.query(
        `UPDATE tenants SET tenant_type = $2, name = $3 WHERE id = $1`,
        [tenantId, tenantType, name]
      );
    } else {
      await client.query(`UPDATE tenants SET tenant_type = $2 WHERE id = $1`, [
        tenantId,
        tenantType,
      ]);
    }
  } finally {
    client.release();
  }
}

export async function findUserByEmail(email: string): Promise<{
  id: string;
  email: string;
  name: string;
  password_hash: string;
  tenant_id: string;
  role_id: string;
  role_name: string;
  tenant_type: TenantType;
} | null> {
  await ensurePlatformTenantSchema();
  const normalized = email.trim().toLowerCase();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT u.id, u.email, u.name, u.password_hash, u.tenant_id, u.role_id,
              COALESCE(r.name, 'agente') AS role_name,
              COALESCE(t.tenant_type, 'customer') AS tenant_type
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       JOIN tenants t ON t.id = u.tenant_id
       WHERE LOWER(u.email) = $1 AND t.is_active = TRUE
       LIMIT 2`,
      [normalized]
    );
    if (result.rows.length === 0) return null;
    if (result.rows.length > 1) {
      throw new Error("MULTIPLE_USERS_FOR_EMAIL");
    }
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function listCustomerTenants(): Promise<TenantRow[]> {
  await ensurePlatformTenantSchema();
  const client = await pool.connect();
  try {
    const result = await client.query<TenantRow>(
      `SELECT id, name, slug, plan, is_active, max_users, max_flows,
              COALESCE(tenant_type, 'customer') AS tenant_type,
              segment
       FROM tenants
       WHERE COALESCE(tenant_type, 'customer') = 'customer'
       ORDER BY name ASC`
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function slugExists(slug: string, excludeId?: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      excludeId
        ? `SELECT 1 FROM tenants WHERE LOWER(slug) = LOWER($1) AND id <> $2 LIMIT 1`
        : `SELECT 1 FROM tenants WHERE LOWER(slug) = LOWER($1) LIMIT 1`,
      excludeId ? [slug, excludeId] : [slug]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

async function bootstrapCustomerRoles(tenantId: string): Promise<void> {
  const roles: AppRole[] = ["admin_local", "supervisor", "agente"];
  for (const role of roles) {
    await getOrCreateRoleId(tenantId, role);
  }
}

export async function createCustomerTenant(input: {
  name: string;
  slug: string;
  segment?: TenantSegment;
  plan?: string;
  maxUsers?: number;
  maxFlows?: number;
  initialAdmin: {
    name: string;
    email: string;
    password: string;
  };
}): Promise<{ tenant: TenantRow; adminUser: { id: string; email: string; name: string } }> {
  await ensurePlatformTenantSchema();

  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (slug.length < 2) {
    throw new Error("INVALID_SLUG");
  }
  if (await slugExists(slug)) {
    throw new Error("SLUG_ALREADY_EXISTS");
  }

  const client = await pool.connect();
  let tenantId: string | null = null;
  try {
    const inserted = await client.query<TenantRow>(
      `INSERT INTO tenants (id, name, slug, plan, is_active, max_users, max_flows, tenant_type, segment)
       VALUES (gen_random_uuid(), $1, $2, $3, true, $4, $5, 'customer', $6)
       RETURNING id, name, slug, plan, is_active, max_users, max_flows, tenant_type, segment`,
      [
        input.name.trim(),
        slug,
        input.plan?.trim() || "mvp",
        input.maxUsers ?? 50,
        input.maxFlows ?? 200,
        input.segment ?? null,
      ]
    );
    const tenant = inserted.rows[0];
    tenantId = tenant.id;
    await bootstrapCustomerRoles(tenant.id);

    const roleId = await getOrCreateRoleId(tenant.id, "admin_local");
    const passwordHash = await bcrypt.hash(input.initialAdmin.password, 10);
    const email = input.initialAdmin.email.trim().toLowerCase();
    const userIns = await client.query<{ id: string; email: string; name: string }>(
      `INSERT INTO users (id, email, name, password_hash, tenant_id, role_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING id, email, name`,
      [email, input.initialAdmin.name.trim(), passwordHash, tenant.id, roleId]
    );
    return { tenant, adminUser: userIns.rows[0] };
  } catch (e) {
    if (tenantId) {
      await client.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]).catch(() => {});
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function assertCustomerTenantTarget(tenantId: string): Promise<TenantRow> {
  const tenant = await getTenantById(tenantId);
  if (!tenant || !tenant.is_active) {
    throw new Error("TENANT_NOT_FOUND");
  }
  if (tenant.tenant_type !== "customer") {
    throw new Error("NOT_CUSTOMER_TENANT");
  }
  return tenant;
}
