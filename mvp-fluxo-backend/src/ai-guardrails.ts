import { pool } from "./db";

export type GuardrailPolicyRecord = {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  description: string | null;
  version: string;
  status: string;
  rules_text: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

let schemaReady = false;

export async function ensureGuardrailSchema(): Promise<void> {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_guardrail_policies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        key text NOT NULL,
        name text NOT NULL,
        description text,
        version text NOT NULL DEFAULT 'v1',
        status text NOT NULL DEFAULT 'draft',
        rules_text text NOT NULL DEFAULT '',
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, key, version)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_guardrail_policies_tenant
      ON ai_guardrail_policies (tenant_id, is_active, name)
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

function mapRow(row: Record<string, unknown>): GuardrailPolicyRecord {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    key: String(row.key),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    version: String(row.version ?? "v1"),
    status: String(row.status ?? "draft"),
    rules_text: String(row.rules_text ?? ""),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listGuardrailPolicies(tenantId: string): Promise<GuardrailPolicyRecord[]> {
  await ensureGuardrailSchema();
  const result = await pool.query(
    `SELECT * FROM ai_guardrail_policies
     WHERE tenant_id = $1::uuid
     ORDER BY is_active DESC, name ASC, version DESC`,
    [tenantId]
  );
  return result.rows.map((r) => mapRow(r as Record<string, unknown>));
}

export async function getGuardrailPolicyById(
  tenantId: string,
  policyId: string
): Promise<GuardrailPolicyRecord | null> {
  await ensureGuardrailSchema();
  const result = await pool.query(
    `SELECT * FROM ai_guardrail_policies WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, policyId]
  );
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function createGuardrailPolicy(input: {
  tenantId: string;
  key: string;
  name: string;
  description?: string;
  version?: string;
  status?: string;
  rulesText: string;
}): Promise<GuardrailPolicyRecord> {
  await ensureGuardrailSchema();
  const result = await pool.query(
    `INSERT INTO ai_guardrail_policies (tenant_id, key, name, description, version, status, rules_text)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.tenantId,
      input.key.trim().toLowerCase().replace(/\s+/g, "_"),
      input.name.trim(),
      input.description?.trim() || null,
      input.version?.trim() || "v1",
      input.status?.trim() || "draft",
      input.rulesText.trim(),
    ]
  );
  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function updateGuardrailPolicy(input: {
  tenantId: string;
  policyId: string;
  name?: string;
  description?: string;
  version?: string;
  status?: string;
  rulesText?: string;
  isActive?: boolean;
}): Promise<GuardrailPolicyRecord | null> {
  await ensureGuardrailSchema();
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const set = (col: string, val: unknown) => {
    updates.push(`${col} = $${i++}`);
    values.push(val);
  };
  if (input.name !== undefined) set("name", input.name.trim());
  if (input.description !== undefined) set("description", input.description.trim() || null);
  if (input.version !== undefined) set("version", input.version.trim());
  if (input.status !== undefined) set("status", input.status.trim());
  if (input.rulesText !== undefined) set("rules_text", input.rulesText.trim());
  if (input.isActive !== undefined) set("is_active", input.isActive);
  if (updates.length === 0) return getGuardrailPolicyById(input.tenantId, input.policyId);
  set("updated_at", new Date().toISOString());
  values.push(input.tenantId, input.policyId);
  const result = await pool.query(
    `UPDATE ai_guardrail_policies SET ${updates.join(", ")}
     WHERE tenant_id = $${i++} AND id = $${i}
     RETURNING *`,
    values
  );
  if (!result.rows[0]) return null;
  return mapRow(result.rows[0] as Record<string, unknown>);
}

export type GuardrailApplyResult = {
  text: string;
  blocked: boolean;
  violations: string[];
  mode: "live" | "shadow";
};

/** Aplica regras de policy ao texto gerado (live bloqueia termos; shadow só audita). */
export async function applyGuardrailsToText(input: {
  tenantId: string;
  policyId: string | null;
  deployMode: "live" | "shadow";
  text: string;
}): Promise<GuardrailApplyResult> {
  if (!input.policyId?.trim()) {
    return { text: input.text, blocked: false, violations: [], mode: input.deployMode };
  }
  const policy = await getGuardrailPolicyById(input.tenantId, input.policyId);
  if (!policy || !policy.is_active) {
    return { text: input.text, blocked: false, violations: [], mode: input.deployMode };
  }

  const violations: string[] = [];
  const lines = policy.rules_text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("BLOCK:"))
    .map((l) => l.replace(/^BLOCK:\s*/i, "").trim())
    .filter(Boolean);

  let masked = input.text;
  for (const term of lines) {
    if (!term) continue;
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (re.test(masked)) {
      violations.push(term);
      if (input.deployMode === "live") {
        masked = masked.replace(re, "[bloqueado]");
      }
    }
  }

  const blocked = input.deployMode === "live" && violations.length > 0;
  return {
    text: masked,
    blocked,
    violations,
    mode: input.deployMode,
  };
}
