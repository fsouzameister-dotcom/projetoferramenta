import { pool } from "./db";
import { generateAiText, listAiPersonas } from "./ai";
import { ApiError, ERROR_CODES } from "./http";
import { parseJsonFromModel } from "./flow-executor-utils";
import type { AiInsightFilters } from "./ai-insight-context";
import { buildAiInsightContext } from "./ai-insight-context";
import {
  buildInsightSystemPrompt,
  buildInsightUserMessage,
  buildResolvedInsightPrompt,
  parseInsightResultFromModel,
} from "./ai-insight-prompts";
import {
  ensureAiInsightSchema,
  getAiInsightTemplate,
  getDefaultAiInsightTemplate,
} from "./ai-insight-templates";
import { enqueueAiInsightJob } from "./ai-insight-scheduler";

export type AiInsightJobStatus = "queued" | "running" | "done" | "failed";

export type AiInsightJobSummary = {
  jobId: string;
  status: AiInsightJobStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  templateId: string | null;
  requestedBy: string | null;
};

export type AiInsightResult = {
  summary: string;
  highlights: string[];
  risks: string[];
  opportunities: string[];
  metrics: Record<string, unknown>;
  rawResponse: string | null;
  createdAt: string;
};

export type AiInsightJobDetail = AiInsightJobSummary & {
  filters: AiInsightFilters;
  promptOverride: string | null;
  errorMessage: string | null;
  result: AiInsightResult | null;
};

async function ensureSchema() {
  await ensureAiInsightSchema();
}

function mapJobSummary(row: Record<string, unknown>): AiInsightJobSummary {
  return {
    jobId: String(row.id),
    status: String(row.status) as AiInsightJobStatus,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    startedAt:
      row.started_at instanceof Date
        ? row.started_at.toISOString()
        : row.started_at
          ? String(row.started_at)
          : null,
    finishedAt:
      row.finished_at instanceof Date
        ? row.finished_at.toISOString()
        : row.finished_at
          ? String(row.finished_at)
          : null,
    templateId: row.template_id ? String(row.template_id) : null,
    requestedBy: row.requested_by ? String(row.requested_by) : null,
  };
}

async function resolvePersonaId(tenantId: string, filters: AiInsightFilters): Promise<string> {
  if (filters.personaId?.trim()) return filters.personaId.trim();
  const personas = await listAiPersonas(tenantId);
  const active = personas.find((p) => p.is_active);
  if (!active) {
    throw new ApiError(
      404,
      ERROR_CODES.ai.AI_PERSONA_NOT_FOUND,
      "Nenhuma persona ativa encontrada para gerar insights"
    );
  }
  return active.id;
}

export async function createAiInsightJob(input: {
  tenantId: string;
  requestedBy?: string;
  filters: AiInsightFilters;
  templateId?: string;
  promptOverride?: string;
}): Promise<AiInsightJobSummary> {
  await ensureSchema();

  const dateFrom = input.filters.dateFrom?.trim();
  const dateTo = input.filters.dateTo?.trim();
  if (!dateFrom || !dateTo) {
    throw new ApiError(
      400,
      ERROR_CODES.common.VALIDATION_ERROR,
      "dateFrom e dateTo são obrigatórios"
    );
  }

  let templateSystemPrompt: string | null = null;
  let templateId: string | null = input.templateId?.trim() || null;

  if (templateId) {
    const template = await getAiInsightTemplate(input.tenantId, templateId);
    if (!template || !template.isActive) {
      throw new ApiError(
        404,
        ERROR_CODES.ai.AI_INSIGHT_TEMPLATE_NOT_FOUND,
        "Template de insight não encontrado ou inativo"
      );
    }
    templateSystemPrompt = template.systemPrompt;
  } else {
    const defaultTemplate = await getDefaultAiInsightTemplate(input.tenantId);
    if (defaultTemplate) {
      templateId = defaultTemplate.id;
      templateSystemPrompt = defaultTemplate.systemPrompt;
    }
  }

  const contextPreview = await buildAiInsightContext(input.tenantId, input.filters);
  const resolvedPrompt = buildResolvedInsightPrompt({
    templateSystemPrompt,
    promptOverride: input.promptOverride,
    contextBlock: contextPreview.contextText,
  });

  const created = await pool.query(
    `INSERT INTO ai_insight_jobs
       (tenant_id, requested_by, template_id, prompt_override, resolved_prompt, filters, status)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, 'queued')
     RETURNING *`,
    [
      input.tenantId,
      input.requestedBy ?? null,
      templateId,
      input.promptOverride?.trim() || null,
      resolvedPrompt,
      JSON.stringify(input.filters),
    ]
  );

  const job = mapJobSummary(created.rows[0] as Record<string, unknown>);
  await enqueueAiInsightJob(job.jobId);
  return job;
}

export async function listAiInsightJobs(
  tenantId: string,
  limit = 30
): Promise<AiInsightJobSummary[]> {
  await ensureSchema();
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const result = await pool.query(
    `SELECT id, status, created_at, started_at, finished_at, template_id, requested_by
     FROM ai_insight_jobs
     WHERE tenant_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT $2`,
    [tenantId, safeLimit]
  );
  return result.rows.map((row) => mapJobSummary(row as Record<string, unknown>));
}

export async function getAiInsightJob(
  tenantId: string,
  jobId: string
): Promise<AiInsightJobDetail | null> {
  await ensureSchema();
  const jobResult = await pool.query(
    `SELECT * FROM ai_insight_jobs WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
    [tenantId, jobId]
  );
  const jobRow = jobResult.rows[0];
  if (!jobRow) return null;

  const summary = mapJobSummary(jobRow as Record<string, unknown>);
  const filters =
    jobRow.filters && typeof jobRow.filters === "object"
      ? (jobRow.filters as AiInsightFilters)
      : ({} as AiInsightFilters);

  let result: AiInsightResult | null = null;
  if (summary.status === "done") {
    const resultRow = await pool.query(
      `SELECT * FROM ai_insight_results WHERE job_id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`,
      [jobId, tenantId]
    );
    const r = resultRow.rows[0];
    if (r) {
      result = {
        summary: r.summary ? String(r.summary) : "",
        highlights: Array.isArray(r.highlights) ? r.highlights.map(String) : [],
        risks: Array.isArray(r.risks) ? r.risks.map(String) : [],
        opportunities: Array.isArray(r.opportunities) ? r.opportunities.map(String) : [],
        metrics:
          r.metrics && typeof r.metrics === "object" && !Array.isArray(r.metrics)
            ? (r.metrics as Record<string, unknown>)
            : {},
        rawResponse: r.raw_response ? String(r.raw_response) : null,
        createdAt:
          r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      };
    }
  }

  return {
    ...summary,
    filters,
    promptOverride: jobRow.prompt_override ? String(jobRow.prompt_override) : null,
    errorMessage: jobRow.error_message ? String(jobRow.error_message) : null,
    result,
  };
}

export async function processAiInsightJob(jobId: string): Promise<void> {
  await ensureSchema();

  const lock = await pool.query(
    `UPDATE ai_insight_jobs
     SET status = 'running', started_at = COALESCE(started_at, now())
     WHERE id = $1::uuid AND status IN ('queued', 'running')
     RETURNING *`,
    [jobId]
  );
  const jobRow = lock.rows[0];
  if (!jobRow) return;

  const tenantId = String(jobRow.tenant_id);
  const filters =
    jobRow.filters && typeof jobRow.filters === "object"
      ? (jobRow.filters as AiInsightFilters)
      : ({} as AiInsightFilters);

  try {
    const contextBundle = await buildAiInsightContext(tenantId, filters);

    let templateSystemPrompt: string | null = null;
    if (jobRow.template_id) {
      const template = await getAiInsightTemplate(tenantId, String(jobRow.template_id));
      templateSystemPrompt = template?.systemPrompt ?? null;
    }

    const systemPrompt = buildInsightSystemPrompt({
      templateSystemPrompt,
      promptOverride: jobRow.prompt_override ? String(jobRow.prompt_override) : null,
    });
    const userMessage = buildInsightUserMessage(contextBundle.contextText);
    const resolvedPrompt = buildResolvedInsightPrompt({
      templateSystemPrompt,
      promptOverride: jobRow.prompt_override ? String(jobRow.prompt_override) : null,
      contextBlock: contextBundle.contextText,
    });

    await pool.query(`UPDATE ai_insight_jobs SET resolved_prompt = $2 WHERE id = $1::uuid`, [
      jobId,
      resolvedPrompt,
    ]);

    const personaId = await resolvePersonaId(tenantId, filters);
    const ai = await generateAiText({
      tenantId,
      personaId,
      message: userMessage,
      systemPromptOverride: systemPrompt,
      temperature: 0.2,
    });

    const parsed = parseJsonFromModel(ai.text);
    const insight = parseInsightResultFromModel(parsed, ai.text);
    const metrics = {
      ...insight.metrics,
      totalConversas: contextBundle.stats.totalConversations,
      conversasAmostradas: contextBundle.stats.sampledConversations,
      mensagensAmostradas: contextBundle.stats.totalMessages,
    };

    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO ai_insight_results
           (job_id, tenant_id, summary, highlights, risks, opportunities, metrics, raw_response)
         VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)
         ON CONFLICT (job_id) DO UPDATE SET
           summary = EXCLUDED.summary,
           highlights = EXCLUDED.highlights,
           risks = EXCLUDED.risks,
           opportunities = EXCLUDED.opportunities,
           metrics = EXCLUDED.metrics,
           raw_response = EXCLUDED.raw_response`,
        [
          jobId,
          tenantId,
          insight.summary,
          JSON.stringify(insight.highlights),
          JSON.stringify(insight.risks),
          JSON.stringify(insight.opportunities),
          JSON.stringify(metrics),
          ai.text,
        ]
      );
      await pool.query(
        `UPDATE ai_insight_jobs
         SET status = 'done', finished_at = now(), error_message = NULL
         WHERE id = $1::uuid`,
        [jobId]
      );
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Falha ao processar insight";
    await pool.query(
      `UPDATE ai_insight_jobs
       SET status = 'failed', finished_at = now(), error_message = $2
       WHERE id = $1::uuid`,
      [jobId, message.slice(0, 2000)]
    );
    throw error;
  }
}
