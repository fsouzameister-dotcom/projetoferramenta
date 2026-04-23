import bcrypt from "bcrypt";
import { pool } from "./db";

export type AppRole = "admin_local" | "supervisor" | "agente";

export type TenantUser = {
  id: string;
  email: string;
  name: string;
  tenant_id: string;
  role_id: string;
  role_name: string;
};

const ALLOWED_ROLES: AppRole[] = ["admin_local", "supervisor", "agente"];

export function isAllowedRole(role: string): role is AppRole {
  return ALLOWED_ROLES.includes(role as AppRole);
}

export async function listUsersByTenant(tenantId: string): Promise<TenantUser[]> {
  const client = await pool.connect();
  try {
    const result = await client.query<TenantUser>(
      `SELECT u.id, u.email, u.name, u.tenant_id, u.role_id, COALESCE(r.name, 'agente') AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.tenant_id = $1
       ORDER BY u.created_at DESC NULLS LAST, u.email ASC`,
      [tenantId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getOrCreateRoleId(
  tenantId: string,
  roleName: AppRole
): Promise<string> {
  const client = await pool.connect();
  try {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM roles WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
      [tenantId, roleName]
    );
    if (existing.rows.length > 0) return existing.rows[0].id;

    const created = await client.query<{ id: string }>(
      `INSERT INTO roles (id, tenant_id, name)
       VALUES (gen_random_uuid(), $1, $2)
       RETURNING id`,
      [tenantId, roleName]
    );
    return created.rows[0].id;
  } finally {
    client.release();
  }
}

export async function createUserForTenant(input: {
  tenantId: string;
  name: string;
  email: string;
  password: string;
  roleName: AppRole;
}): Promise<TenantUser> {
  const roleId = await getOrCreateRoleId(input.tenantId, input.roleName);
  const passwordHash = await bcrypt.hash(input.password, 10);
  const client = await pool.connect();
  try {
    const inserted = await client.query<TenantUser>(
      `INSERT INTO users (id, email, name, password_hash, tenant_id, role_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING id, email, name, tenant_id, role_id`,
      [input.email.trim().toLowerCase(), input.name.trim(), passwordHash, input.tenantId, roleId]
    );
    return {
      ...inserted.rows[0],
      role_name: input.roleName,
    };
  } finally {
    client.release();
  }
}

export async function updateUserForTenant(input: {
  tenantId: string;
  userId: string;
  name?: string;
  email?: string;
  password?: string;
  roleName?: AppRole;
}): Promise<TenantUser | null> {
  const client = await pool.connect();
  try {
    const checks = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND tenant_id = $2`,
      [input.userId, input.tenantId]
    );
    if (checks.rows.length === 0) return null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let p = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${p++}`);
      values.push(input.name.trim());
    }
    if (input.email !== undefined) {
      updates.push(`email = $${p++}`);
      values.push(input.email.trim().toLowerCase());
    }
    if (input.password !== undefined && input.password.trim()) {
      const hash = await bcrypt.hash(input.password, 10);
      updates.push(`password_hash = $${p++}`);
      values.push(hash);
    }
    if (input.roleName !== undefined) {
      const roleId = await getOrCreateRoleId(input.tenantId, input.roleName);
      updates.push(`role_id = $${p++}`);
      values.push(roleId);
    }

    if (updates.length === 0) {
      const unchanged = await client.query<TenantUser>(
        `SELECT u.id, u.email, u.name, u.tenant_id, u.role_id, COALESCE(r.name, 'agente') AS role_name
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1 AND u.tenant_id = $2`,
        [input.userId, input.tenantId]
      );
      return unchanged.rows[0] ?? null;
    }

    values.push(input.userId, input.tenantId);
    const updated = await client.query<TenantUser>(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = $${p++} AND tenant_id = $${p}
       RETURNING id, email, name, tenant_id, role_id`,
      values
    );
    if (!updated.rows[0]) return null;

    const role = await client.query<{ name: string }>(
      `SELECT name FROM roles WHERE id = $1`,
      [updated.rows[0].role_id]
    );

    return {
      ...updated.rows[0],
      role_name: role.rows[0]?.name ?? "agente",
    };
  } finally {
    client.release();
  }
}

export async function deleteUserForTenant(tenantId: string, userId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const deleted = await client.query(
      `DELETE FROM users WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return (deleted.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}
