import { pool } from "./db";
import type { AppRole } from "./auth-roles";
import {
  type AppPermission,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  normalizePermissions,
  resolveEffectivePermissions,
  sanitizePermissionsInput,
} from "./auth-permissions";

export type TenantRole = {
  id: string;
  tenant_id: string;
  name: string;
  label: string;
  is_system: boolean;
  permissions: AppPermission[];
  user_count: number;
};

let schemaReady = false;

async function ensureRolesSchema(): Promise<void> {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE roles ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);
    await client.query(`
      ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
    `);
    await client.query(`
      ALTER TABLE roles ADD COLUMN IF NOT EXISTS label text;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_tenant_name ON roles (tenant_id, name);
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

function roleLabel(name: string, label: string | null): string {
  if (label?.trim()) return label.trim();
  const map: Record<string, string> = {
    platform_admin: "Operador plataforma",
    admin_local: "Admin local",
    supervisor: "Supervisor",
    agente: "Agente",
  };
  return map[name] ?? name;
}

async function backfillSystemRole(
  tenantId: string,
  roleName: AppRole
): Promise<void> {
  const defaults = DEFAULT_ROLE_PERMISSIONS[roleName];
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM roles WHERE tenant_id = $1::uuid AND name = $2 LIMIT 1`,
    [tenantId, roleName]
  );
  if (!existing.rows[0]) {
    await pool.query(
      `INSERT INTO roles (id, tenant_id, name, label, is_system, permissions)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3, true, $4::jsonb)`,
      [tenantId, roleName, roleLabel(roleName, null), JSON.stringify(defaults)]
    );
    return;
  }
  await pool.query(
    `UPDATE roles
     SET is_system = true,
         label = COALESCE(label, $3),
         permissions = CASE
           WHEN permissions IS NULL OR permissions = '[]'::jsonb
           THEN $4::jsonb
           ELSE permissions
         END
     WHERE tenant_id = $1::uuid AND name = $2`,
    [tenantId, roleName, roleLabel(roleName, null), JSON.stringify(defaults)]
  );
}

export async function ensureTenantRolesBootstrapped(tenantId: string): Promise<void> {
  await ensureRolesSchema();
  const roles: AppRole[] = [
    "admin_local",
    "supervisor",
    "agente",
  ];
  for (const role of roles) {
    await backfillSystemRole(tenantId, role);
  }
}

export async function getOrCreateRoleId(
  tenantId: string,
  roleName: AppRole
): Promise<string> {
  await ensureRolesSchema();
  await ensureTenantRolesBootstrapped(tenantId);

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM roles WHERE tenant_id = $1::uuid AND name = $2 LIMIT 1`,
    [tenantId, roleName]
  );
  if (existing.rows[0]) {
    await backfillSystemRole(tenantId, roleName);
    return existing.rows[0].id;
  }

  const defaults = DEFAULT_ROLE_PERMISSIONS[roleName] ?? [];
  const created = await pool.query<{ id: string }>(
    `INSERT INTO roles (id, tenant_id, name, label, is_system, permissions)
     VALUES (gen_random_uuid(), $1::uuid, $2, $3, true, $4::jsonb)
     RETURNING id`,
    [tenantId, roleName, roleLabel(roleName, null), JSON.stringify(defaults)]
  );
  return created.rows[0].id;
}

export async function getPermissionsForRoleId(
  roleId: string
): Promise<{ roleName: string; permissions: AppPermission[] }> {
  await ensureRolesSchema();
  const result = await pool.query<{ name: string; permissions: unknown }>(
    `SELECT name, permissions FROM roles WHERE id = $1::uuid`,
    [roleId]
  );
  const row = result.rows[0];
  if (!row) {
    return { roleName: "agente", permissions: [] };
  }
  return {
    roleName: row.name,
    permissions: resolveEffectivePermissions({
      roleName: row.name,
      storedPermissions: row.permissions,
    }),
  };
}

export async function listRolesByTenant(tenantId: string): Promise<TenantRole[]> {
  await ensureRolesSchema();
  await ensureTenantRolesBootstrapped(tenantId);

  const result = await pool.query<{
    id: string;
    tenant_id: string;
    name: string;
    label: string | null;
    is_system: boolean;
    permissions: unknown;
    user_count: string;
  }>(
    `SELECT r.id, r.tenant_id, r.name, r.label, COALESCE(r.is_system, false) AS is_system,
            r.permissions,
            COUNT(u.id)::text AS user_count
     FROM roles r
     LEFT JOIN users u ON u.role_id = r.id
     WHERE r.tenant_id = $1::uuid
     GROUP BY r.id
     ORDER BY r.is_system DESC, r.name ASC`,
    [tenantId]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    name: String(row.name),
    label: roleLabel(row.name, row.label),
    is_system: Boolean(row.is_system),
    permissions: resolveEffectivePermissions({
      roleName: row.name,
      storedPermissions: row.permissions,
    }),
    user_count: Number(row.user_count) || 0,
  }));
}

export async function updateRoleForTenant(input: {
  tenantId: string;
  roleId: string;
  label?: string;
  permissions?: AppPermission[];
}): Promise<TenantRole | null> {
  await ensureRolesSchema();
  const existing = await pool.query<{
    id: string;
    name: string;
    is_system: boolean;
  }>(
    `SELECT id, name, COALESCE(is_system, false) AS is_system
     FROM roles WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [input.roleId, input.tenantId]
  );
  const row = existing.rows[0];
  if (!row) return null;

  if (row.name === "platform_admin" || row.name === "agente") {
    throw new Error("ROLE_NOT_EDITABLE");
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let p = 1;

  if (input.label !== undefined) {
    updates.push(`label = $${p++}`);
    values.push(input.label.trim() || roleLabel(row.name, null));
  }
  if (input.permissions !== undefined) {
    updates.push(`permissions = $${p++}::jsonb`);
    values.push(JSON.stringify(sanitizePermissionsInput(input.permissions)));
  }

  if (updates.length === 0) {
    const roles = await listRolesByTenant(input.tenantId);
    return roles.find((r) => r.id === input.roleId) ?? null;
  }

  values.push(input.roleId, input.tenantId);
  await pool.query(
    `UPDATE roles SET ${updates.join(", ")} WHERE id = $${p++}::uuid AND tenant_id = $${p}::uuid`,
    values
  );

  const roles = await listRolesByTenant(input.tenantId);
  return roles.find((r) => r.id === input.roleId) ?? null;
}

export async function createCustomRole(input: {
  tenantId: string;
  name: string;
  label: string;
  permissions: AppPermission[];
}): Promise<TenantRole> {
  await ensureRolesSchema();
  const slug = input.name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  if (!slug) throw new Error("ROLE_NAME_INVALID");
  if (["platform_admin", "admin_local", "supervisor", "agente", "admin"].includes(slug)) {
    throw new Error("ROLE_NAME_RESERVED");
  }

  const perms = sanitizePermissionsInput(input.permissions);
  if (perms.length === 0) throw new Error("ROLE_PERMISSIONS_REQUIRED");

  try {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO roles (id, tenant_id, name, label, is_system, permissions)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3, false, $4::jsonb)
       RETURNING id`,
      [
        input.tenantId,
        slug,
        input.label.trim() || slug,
        JSON.stringify(perms),
      ]
    );
    const roles = await listRolesByTenant(input.tenantId);
    const created = roles.find((r) => r.id === inserted.rows[0].id);
    if (!created) throw new Error("ROLE_CREATE_FAILED");
    return created;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      throw new Error("ROLE_NAME_EXISTS");
    }
    throw err;
  }
}

export async function deleteCustomRole(
  tenantId: string,
  roleId: string
): Promise<boolean> {
  await ensureRolesSchema();
  const role = await pool.query<{ is_system: boolean }>(
    `SELECT COALESCE(is_system, false) AS is_system FROM roles
     WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [roleId, tenantId]
  );
  if (!role.rows[0] || role.rows[0].is_system) {
    throw new Error("ROLE_NOT_DELETABLE");
  }
  const users = await pool.query(
    `SELECT 1 FROM users WHERE role_id = $1::uuid LIMIT 1`,
    [roleId]
  );
  if (users.rows.length > 0) throw new Error("ROLE_IN_USE");

  const deleted = await pool.query(
    `DELETE FROM roles WHERE id = $1::uuid AND tenant_id = $2::uuid AND is_system = false`,
    [roleId, tenantId]
  );
  return (deleted.rowCount ?? 0) > 0;
}

export function getPermissionCatalog() {
  return PERMISSION_CATALOG;
}

export { normalizePermissions };
