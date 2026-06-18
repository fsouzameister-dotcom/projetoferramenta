import { pool } from "./db";
import { ApiError, ERROR_CODES } from "./http";

export type AiInsightTemplate = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
  isDefault: boolean;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

let schemaReady = false;

function mapRow(row: Record<string, unknown>): AiInsightTemplate {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    systemPrompt: String(row.system_prompt),
    outputSchema:
      row.output_schema && typeof row.output_schema === "object"
        ? (row.output_schema as Record<string, unknown>)
        : { fields: ["summary", "highlights", "risks", "opportunities", "metrics"] },
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function ensureAiInsightSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_insight_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name text NOT NULL,
        description text,
        system_prompt text NOT NULL,
        output_schema jsonb NOT NULL DEFAULT '{"fields":["summary","highlights","risks","opportunities","metrics"]}'::jsonb,
        is_default boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_insight_templates_tenant_active
        ON ai_insight_templates (tenant_id, is_active)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_insight_template_default_per_tenant
        ON ai_insight_templates (tenant_id) WHERE is_default = true
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_insight_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        requested_by uuid,
        template_id uuid REFERENCES ai_insight_templates(id) ON DELETE SET NULL,
        prompt_override text,
        resolved_prompt text,
        filters jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'running', 'done', 'failed')),
        error_message text,
        started_at timestamptz,
        finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_insight_jobs_tenant_created
        ON ai_insight_jobs (tenant_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_insight_jobs_status
        ON ai_insight_jobs (status, created_at)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_insight_results (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id uuid NOT NULL REFERENCES ai_insight_jobs(id) ON DELETE CASCADE,
        tenant_id uuid NOT NULL,
        summary text,
        highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
        risks jsonb NOT NULL DEFAULT '[]'::jsonb,
        opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
        metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
        raw_response text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_insight_results_job
        ON ai_insight_results (job_id)
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

export async function listAiInsightTemplates(tenantId: string): Promise<AiInsightTemplate[]> {
  await ensureAiInsightSchema();
  const result = await pool.query(
    `SELECT * FROM ai_insight_templates
     WHERE tenant_id = $1::uuid
     ORDER BY is_default DESC, name ASC`,
    [tenantId]
  );
  return result.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function getAiInsightTemplate(
  tenantId: string,
  templateId: string
): Promise<AiInsightTemplate | null> {
  await ensureAiInsightSchema();
  const result = await pool.query(
    `SELECT * FROM ai_insight_templates WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
    [tenantId, templateId]
  );
  const row = result.rows[0];
  return row ? mapRow(row as Record<string, unknown>) : null;
}

export async function getDefaultAiInsightTemplate(
  tenantId: string
): Promise<AiInsightTemplate | null> {
  await ensureAiInsightSchema();
  const result = await pool.query(
    `SELECT * FROM ai_insight_templates
     WHERE tenant_id = $1::uuid AND is_default = true AND is_active = true
     LIMIT 1`,
    [tenantId]
  );
  const row = result.rows[0];
  return row ? mapRow(row as Record<string, unknown>) : null;
}

export async function createAiInsightTemplate(input: {
  tenantId: string;
  name: string;
  description?: string;
  systemPrompt: string;
  outputSchema?: Record<string, unknown>;
  isDefault?: boolean;
  isActive?: boolean;
  createdBy?: string;
}): Promise<AiInsightTemplate> {
  await ensureAiInsightSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.isDefault) {
      await client.query(
        `UPDATE ai_insight_templates SET is_default = false, updated_at = now() WHERE tenant_id = $1::uuid`,
        [input.tenantId]
      );
    }
    const created = await client.query(
      `INSERT INTO ai_insight_templates
         (tenant_id, name, description, system_prompt, output_schema, is_default, is_active, created_by)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8::uuid)
       RETURNING *`,
      [
        input.tenantId,
        input.name.trim(),
        input.description?.trim() || null,
        input.systemPrompt.trim(),
        JSON.stringify(
          input.outputSchema ?? {
            fields: ["summary", "highlights", "risks", "opportunities", "metrics"],
          }
        ),
        Boolean(input.isDefault),
        input.isActive !== false,
        input.createdBy ?? null,
      ]
    );
    await client.query("COMMIT");
    return mapRow(created.rows[0] as Record<string, unknown>);
  } catch (error) {
    await client.query("ROLLBACK");
    throw new ApiError(
      500,
      ERROR_CODES.ai.AI_INSIGHT_TEMPLATE_CREATE_FAILED,
      "Falha ao criar template de insight"
    );
  } finally {
    client.release();
  }
}

export async function updateAiInsightTemplate(input: {
  tenantId: string;
  templateId: string;
  name?: string;
  description?: string | null;
  systemPrompt?: string;
  outputSchema?: Record<string, unknown>;
  isDefault?: boolean;
  isActive?: boolean;
}): Promise<AiInsightTemplate> {
  await ensureAiInsightSchema();
  const existing = await getAiInsightTemplate(input.tenantId, input.templateId);
  if (!existing) {
    throw new ApiError(
      404,
      ERROR_CODES.ai.AI_INSIGHT_TEMPLATE_NOT_FOUND,
      "Template de insight não encontrado"
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.isDefault) {
      await client.query(
        `UPDATE ai_insight_templates SET is_default = false, updated_at = now() WHERE tenant_id = $1::uuid`,
        [input.tenantId]
      );
    }
    const updated = await client.query(
      `UPDATE ai_insight_templates SET
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         system_prompt = COALESCE($5, system_prompt),
         output_schema = COALESCE($6::jsonb, output_schema),
         is_default = COALESCE($7, is_default),
         is_active = COALESCE($8, is_active),
         updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING *`,
      [
        input.tenantId,
        input.templateId,
        input.name?.trim(),
        input.description === undefined ? undefined : input.description,
        input.systemPrompt?.trim(),
        input.outputSchema ? JSON.stringify(input.outputSchema) : null,
        input.isDefault,
        input.isActive,
      ]
    );
    await client.query("COMMIT");
    return mapRow(updated.rows[0] as Record<string, unknown>);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      ERROR_CODES.ai.AI_INSIGHT_TEMPLATE_UPDATE_FAILED,
      "Falha ao atualizar template de insight"
    );
  } finally {
    client.release();
  }
}

export async function deleteAiInsightTemplate(tenantId: string, templateId: string): Promise<void> {
  await ensureAiInsightSchema();
  const result = await pool.query(
    `DELETE FROM ai_insight_templates WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, templateId]
  );
  if (result.rowCount === 0) {
    throw new ApiError(
      404,
      ERROR_CODES.ai.AI_INSIGHT_TEMPLATE_NOT_FOUND,
      "Template de insight não encontrado"
    );
  }
}
