import { pool } from "./db";
import type { CaptureInputMode, CaptureOption } from "./capturar-entrada";

export type FlowResponseEventRecord = {
  id: string;
  tenantId: string;
  flowId: string;
  nodeId: string;
  conversationId: string | null;
  phone: string | null;
  sessionId: string | null;
  questionKey: string;
  promptText: string | null;
  answerType: CaptureInputMode;
  variableName: string;
  selectedOptions: CaptureOption[];
  rawValue: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type RecordFlowResponseInput = {
  tenantId: string;
  flowId: string;
  nodeId: string;
  conversationId?: string;
  phone?: string;
  sessionId?: string;
  questionKey: string;
  promptText?: string;
  answerType: CaptureInputMode;
  variableName: string;
  selectedOptions: CaptureOption[];
  rawValue?: string;
  metadata?: Record<string, unknown>;
};

export type ListFlowResponsesFilter = {
  tenantId: string;
  flowId?: string;
  nodeId?: string;
  questionKey?: string;
  conversationId?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export type FlowResponseAggregateRow = {
  flowId: string;
  nodeId: string;
  questionKey: string;
  optionId: string;
  optionLabel: string;
  count: number;
};

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS flow_response_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        flow_id uuid NOT NULL,
        node_id uuid NOT NULL,
        conversation_id uuid,
        phone text,
        session_id text,
        question_key text NOT NULL,
        prompt_text text,
        answer_type text NOT NULL,
        variable_name text NOT NULL,
        selected_options jsonb NOT NULL DEFAULT '[]'::jsonb,
        raw_value text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_flow_response_events_tenant_created
      ON flow_response_events (tenant_id, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_flow_response_events_flow_question
      ON flow_response_events (tenant_id, flow_id, question_key, created_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_flow_response_events_conversation
      ON flow_response_events (tenant_id, conversation_id)
      WHERE conversation_id IS NOT NULL
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

function mapRow(row: Record<string, unknown>): FlowResponseEventRecord {
  const selected =
    row.selected_options && typeof row.selected_options === "object"
      ? (row.selected_options as CaptureOption[])
      : [];
  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    flowId: String(row.flow_id),
    nodeId: String(row.node_id),
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    phone: row.phone ? String(row.phone) : null,
    sessionId: row.session_id ? String(row.session_id) : null,
    questionKey: String(row.question_key),
    promptText: row.prompt_text ? String(row.prompt_text) : null,
    answerType: String(row.answer_type) as CaptureInputMode,
    variableName: String(row.variable_name),
    selectedOptions: selected,
    rawValue: row.raw_value ? String(row.raw_value) : null,
    metadata,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export async function recordFlowResponseEvent(
  input: RecordFlowResponseInput
): Promise<FlowResponseEventRecord> {
  await ensureSchema();
  const selectedOptions = input.selectedOptions ?? [];
  const rawValue =
    input.rawValue ??
    (Array.isArray(selectedOptions)
      ? selectedOptions.map((o) => o.id).join(",")
      : "");

  const result = await pool.query(
    `INSERT INTO flow_response_events (
      tenant_id, flow_id, node_id, conversation_id, phone, session_id,
      question_key, prompt_text, answer_type, variable_name,
      selected_options, raw_value, metadata
    ) VALUES (
      $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6,
      $7, $8, $9, $10,
      $11::jsonb, $12, $13::jsonb
    )
    RETURNING *`,
    [
      input.tenantId,
      input.flowId,
      input.nodeId,
      input.conversationId ?? null,
      input.phone ?? null,
      input.sessionId ?? null,
      input.questionKey,
      input.promptText ?? null,
      input.answerType,
      input.variableName,
      JSON.stringify(selectedOptions),
      rawValue || null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );

  return mapRow(result.rows[0] as Record<string, unknown>);
}

export async function listFlowResponseEvents(
  filter: ListFlowResponsesFilter
): Promise<FlowResponseEventRecord[]> {
  await ensureSchema();
  const clauses = ["tenant_id = $1::uuid"];
  const params: unknown[] = [filter.tenantId];
  let idx = 2;

  if (filter.flowId) {
    clauses.push(`flow_id = $${idx}::uuid`);
    params.push(filter.flowId);
    idx += 1;
  }
  if (filter.nodeId) {
    clauses.push(`node_id = $${idx}::uuid`);
    params.push(filter.nodeId);
    idx += 1;
  }
  if (filter.questionKey) {
    clauses.push(`question_key = $${idx}`);
    params.push(filter.questionKey);
    idx += 1;
  }
  if (filter.conversationId) {
    clauses.push(`conversation_id = $${idx}::uuid`);
    params.push(filter.conversationId);
    idx += 1;
  }
  if (filter.from) {
    clauses.push(`created_at >= $${idx}::timestamptz`);
    params.push(filter.from);
    idx += 1;
  }
  if (filter.to) {
    clauses.push(`created_at <= $${idx}::timestamptz`);
    params.push(filter.to);
    idx += 1;
  }

  const limit =
    typeof filter.limit === "number" && filter.limit > 0
      ? Math.min(filter.limit, 500)
      : 100;

  const result = await pool.query(
    `SELECT * FROM flow_response_events
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${idx}`,
    [...params, limit]
  );

  return result.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function aggregateFlowResponseOptions(
  filter: ListFlowResponsesFilter
): Promise<FlowResponseAggregateRow[]> {
  await ensureSchema();
  const clauses = [
    "e.tenant_id = $1::uuid",
    "e.answer_type IN ('single_choice', 'multi_choice')",
  ];
  const params: unknown[] = [filter.tenantId];
  let idx = 2;

  if (filter.flowId) {
    clauses.push(`e.flow_id = $${idx}::uuid`);
    params.push(filter.flowId);
    idx += 1;
  }
  if (filter.nodeId) {
    clauses.push(`e.node_id = $${idx}::uuid`);
    params.push(filter.nodeId);
    idx += 1;
  }
  if (filter.questionKey) {
    clauses.push(`e.question_key = $${idx}`);
    params.push(filter.questionKey);
    idx += 1;
  }
  if (filter.from) {
    clauses.push(`e.created_at >= $${idx}::timestamptz`);
    params.push(filter.from);
    idx += 1;
  }
  if (filter.to) {
    clauses.push(`e.created_at <= $${idx}::timestamptz`);
    params.push(filter.to);
    idx += 1;
  }

  const result = await pool.query(
    `SELECT
       e.flow_id,
       e.node_id,
       e.question_key,
       opt->>'id' AS option_id,
       opt->>'label' AS option_label,
       COUNT(*)::int AS count
     FROM flow_response_events e,
     LATERAL jsonb_array_elements(
       CASE
         WHEN jsonb_typeof(e.selected_options) = 'array' THEN e.selected_options
         ELSE '[]'::jsonb
       END
     ) AS opt
     WHERE ${clauses.join(" AND ")}
     GROUP BY e.flow_id, e.node_id, e.question_key, opt->>'id', opt->>'label'
     ORDER BY count DESC, option_label ASC`,
    params
  );

  return result.rows.map((row) => ({
    flowId: String(row.flow_id),
    nodeId: String(row.node_id),
    questionKey: String(row.question_key),
    optionId: String(row.option_id ?? ""),
    optionLabel: String(row.option_label ?? ""),
    count: Number(row.count ?? 0),
  }));
}
