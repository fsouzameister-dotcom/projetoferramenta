import bcrypt from "bcrypt";
import { pool } from "./db";
import {
  type AppRole,
  CUSTOMER_ROLES,
  isAllowedRole,
  isAllowedRoleForTenant,
} from "./auth-roles";
import { getTenantById } from "./tenant-platform";
import { getOrCreateRoleId } from "./roles";

export type { AppRole } from "./auth-roles";
export { isAllowedRole, CUSTOMER_ROLES };
export { getOrCreateRoleId } from "./roles";

export type TenantUser = {
  id: string;
  email: string;
  name: string;
  tenant_id: string;
  role_id: string;
  role_name: string;
};

export async function listUsersByTenant(tenantId: string): Promise<TenantUser[]> {
  const client = await pool.connect();
  try {
    const result = await client.query<TenantUser>(
      `SELECT u.id, u.email, u.name, u.tenant_id, u.role_id, COALESCE(r.name, 'agente') AS role_name
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.tenant_id = $1
       ORDER BY u.email ASC`,
      [tenantId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

export async function emailExistsGlobally(
  email: string,
  excludeUserId?: string
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const client = await pool.connect();
  try {
    const result = await client.query(
      excludeUserId
        ? `SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1`
        : `SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      excludeUserId ? [normalized, excludeUserId] : [normalized]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

export async function createUserForTenant(input: {
  tenantId: string;
  name: string;
  email: string;
  password: string;
  roleName?: AppRole;
  roleId?: string;
}): Promise<TenantUser> {
  const tenant = await getTenantById(input.tenantId);
  const tenantType =
    tenant?.tenant_type === "platform" ? "platform" : "customer";

  if (!input.roleId && !input.roleName) {
    throw new Error("ROLE_REQUIRED");
  }

  if (input.roleName && !isAllowedRoleForTenant(input.roleName, tenantType)) {
    throw new Error("ROLE_NOT_ALLOWED_FOR_TENANT");
  }

  if (await emailExistsGlobally(input.email)) {
    const err = new Error("EMAIL_EXISTS") as Error & { code?: string };
    err.code = "23505";
    throw err;
  }

  let roleId = input.roleId;
  let roleName = input.roleName;

  if (roleId) {
    const roleRow = await pool.query<{ name: string }>(
      `SELECT name FROM roles WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [roleId, input.tenantId]
    );
    if (!roleRow.rows[0]) throw new Error("ROLE_NOT_FOUND");
    roleName = roleRow.rows[0].name as AppRole;
  } else if (roleName) {
    roleId = await getOrCreateRoleId(input.tenantId, roleName);
  }

  if (!roleId || !roleName) throw new Error("ROLE_REQUIRED");
  const passwordHash = await bcrypt.hash(input.password, 10);
  const client = await pool.connect();
  try {
    const inserted = await client.query<TenantUser>(
      `INSERT INTO users (id, email, name, password_hash, tenant_id, role_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING id, email, name, tenant_id, role_id`,
      [
        input.email.trim().toLowerCase(),
        input.name.trim(),
        passwordHash,
        input.tenantId,
        roleId,
      ]
    );
    return {
      ...inserted.rows[0],
      role_name: roleName,
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
  roleId?: string;
}): Promise<TenantUser | null> {
  const client = await pool.connect();
  try {
    const checks = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND tenant_id = $2`,
      [input.userId, input.tenantId]
    );
    if (checks.rows.length === 0) return null;

    if (input.email !== undefined) {
      const taken = await emailExistsGlobally(input.email, input.userId);
      if (taken) {
        const err = new Error("EMAIL_EXISTS") as Error & { code?: string };
        err.code = "23505";
        throw err;
      }
    }

    if (input.roleName !== undefined || input.roleId !== undefined) {
      const tenant = await getTenantById(input.tenantId);
      const tenantType =
        tenant?.tenant_type === "platform" ? "platform" : "customer";
      if (input.roleName && !isAllowedRoleForTenant(input.roleName, tenantType)) {
        throw new Error("ROLE_NOT_ALLOWED_FOR_TENANT");
      }
    }

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
    if (input.roleId !== undefined) {
      const roleRow = await client.query<{ id: string }>(
        `SELECT id FROM roles WHERE id = $1::uuid AND tenant_id = $2::uuid`,
        [input.roleId, input.tenantId]
      );
      if (!roleRow.rows[0]) throw new Error("ROLE_NOT_FOUND");
      updates.push(`role_id = $${p++}`);
      values.push(input.roleId);
    } else if (input.roleName !== undefined) {
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

export async function deleteUserForTenant(
  tenantId: string,
  userId: string
): Promise<boolean> {
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
