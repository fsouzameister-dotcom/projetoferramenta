import { pool } from "./db";

export type FlowExecutionMode = "rigid" | "flexible";
export type GuardrailDeployMode = "live" | "shadow";

export type FlowAiSettings = {
  globalPrompt: string;
  language: string;
  voiceId: string;
  executionMode: FlowExecutionMode;
  personaId: string | null;
  providerOverride: { provider?: string; model?: string } | null;
  guardrailPolicyId: string | null;
  guardrailDeployMode: GuardrailDeployMode;
  knowledgeBaseIds: string[];
};

const DEFAULT_SETTINGS: FlowAiSettings = {
  globalPrompt: "",
  language: "pt-BR",
  voiceId: "",
  executionMode: "rigid",
  personaId: null,
  providerOverride: null,
  guardrailPolicyId: null,
  guardrailDeployMode: "live",
  knowledgeBaseIds: [],
};

let schemaReady = false;

export async function ensureFlowAiSchema(): Promise<void> {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE flows
      ADD COLUMN IF NOT EXISTS ai_settings jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

export function normalizeFlowAiSettings(raw: unknown): FlowAiSettings {
  const o =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const kb = Array.isArray(o.knowledgeBaseIds)
    ? o.knowledgeBaseIds.filter((id) => typeof id === "string")
    : [];
  const mode = o.executionMode === "flexible" ? "flexible" : "rigid";
  const deploy = o.guardrailDeployMode === "shadow" ? "shadow" : "live";
  const override =
    o.providerOverride &&
    typeof o.providerOverride === "object" &&
    !Array.isArray(o.providerOverride)
      ? (o.providerOverride as { provider?: string; model?: string })
      : null;
  return {
    globalPrompt: typeof o.globalPrompt === "string" ? o.globalPrompt : "",
    language: typeof o.language === "string" && o.language.trim() ? o.language.trim() : "pt-BR",
    voiceId: typeof o.voiceId === "string" ? o.voiceId : "",
    executionMode: mode,
    personaId: typeof o.personaId === "string" && o.personaId.trim() ? o.personaId.trim() : null,
    providerOverride: override,
    guardrailPolicyId:
      typeof o.guardrailPolicyId === "string" && o.guardrailPolicyId.trim()
        ? o.guardrailPolicyId.trim()
        : null,
    guardrailDeployMode: deploy,
    knowledgeBaseIds: kb,
  };
}

export async function getFlowAiSettings(
  flowId: string,
  tenantId: string
): Promise<FlowAiSettings | null> {
  await ensureFlowAiSchema();
  const result = await pool.query<{ ai_settings: unknown }>(
    `SELECT ai_settings FROM flows WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [flowId, tenantId]
  );
  if (!result.rows[0]) return null;
  return normalizeFlowAiSettings(result.rows[0].ai_settings);
}

export async function updateFlowAiSettings(input: {
  flowId: string;
  tenantId: string;
  settings: Partial<FlowAiSettings>;
}): Promise<FlowAiSettings | null> {
  await ensureFlowAiSchema();
  const current = await getFlowAiSettings(input.flowId, input.tenantId);
  if (!current) return null;
  const merged = normalizeFlowAiSettings({ ...current, ...input.settings });
  const result = await pool.query<{ ai_settings: unknown }>(
    `UPDATE flows SET ai_settings = $1::jsonb
     WHERE id = $2::uuid AND tenant_id = $3::uuid
     RETURNING ai_settings`,
    [JSON.stringify(merged), input.flowId, input.tenantId]
  );
  if (!result.rows[0]) return null;
  return normalizeFlowAiSettings(result.rows[0].ai_settings);
}

export { DEFAULT_SETTINGS as defaultFlowAiSettings };
