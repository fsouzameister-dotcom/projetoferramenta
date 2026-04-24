import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { pool } from "./db";
import { JWT_SECRET } from "./config";
import { ApiError, ERROR_CODES } from "./http";

type ProviderName = "openai" | "gemini";

export type AiProviderSetting = {
  id: string;
  tenant_id: string;
  provider: ProviderName;
  model: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AiPersona = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  tone: string | null;
  system_prompt: string;
  avatar_url: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

let schemaReady = false;

function normalizeProvider(provider: string): ProviderName {
  const normalized = provider.trim().toLowerCase();
  if (normalized !== "openai" && normalized !== "gemini") {
    throw new ApiError(
      400,
      ERROR_CODES.common.VALIDATION_ERROR,
      "Provider inválido. Use 'openai' ou 'gemini'"
    );
  }
  return normalized;
}

function getEncryptionKey() {
  return createHash("sha256").update(JWT_SECRET).digest();
}

function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new ApiError(500, ERROR_CODES.ai.AI_RESPONSE_FAILED, "Falha ao decifrar credencial");
  }
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  const result = Buffer.concat([decipher.update(data), decipher.final()]);
  return result.toString("utf8");
}

async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_provider_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        provider text NOT NULL CHECK (provider IN ('openai', 'gemini')),
        model text NOT NULL,
        api_key_encrypted text NOT NULL,
        is_default boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_provider_default_per_tenant
      ON ai_provider_settings (tenant_id) WHERE is_default = true
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_personas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        name text NOT NULL,
        description text,
        tone text,
        system_prompt text NOT NULL,
        avatar_url text,
        is_active boolean NOT NULL DEFAULT true,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_scripts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        persona_id uuid NOT NULL REFERENCES ai_personas(id) ON DELETE CASCADE,
        flow_id uuid,
        name text NOT NULL,
        script_content jsonb NOT NULL,
        version int NOT NULL DEFAULT 1,
        is_active boolean NOT NULL DEFAULT true,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_scripts_tenant_persona_active
      ON ai_scripts (tenant_id, persona_id, is_active)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        provider text NOT NULL,
        model text NOT NULL,
        persona_id uuid,
        conversation_id uuid,
        request_tokens int NOT NULL DEFAULT 0,
        response_tokens int NOT NULL DEFAULT 0,
        latency_ms int,
        estimated_cost_usd numeric(12,6),
        status text NOT NULL,
        error_code text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

export async function createAiProviderSetting(input: {
  tenantId: string;
  provider: string;
  model: string;
  apiKey: string;
  isDefault?: boolean;
}): Promise<AiProviderSetting> {
  await ensureSchema();
  const provider = normalizeProvider(input.provider);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.isDefault) {
      await client.query(
        "UPDATE ai_provider_settings SET is_default = false, updated_at = now() WHERE tenant_id = $1",
        [input.tenantId]
      );
    }
    const created = await client.query<AiProviderSetting>(
      `INSERT INTO ai_provider_settings (tenant_id, provider, model, api_key_encrypted, is_default)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.tenantId, provider, input.model.trim(), encryptSecret(input.apiKey.trim()), !!input.isDefault]
    );
    await client.query("COMMIT");
    return created.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listAiProviderSettings(tenantId: string): Promise<AiProviderSetting[]> {
  await ensureSchema();
  const result = await pool.query<AiProviderSetting>(
    `SELECT id, tenant_id, provider, model, is_default, is_active, created_at, updated_at
     FROM ai_provider_settings
     WHERE tenant_id = $1
     ORDER BY is_default DESC, created_at ASC`,
    [tenantId]
  );
  return result.rows;
}

export async function createAiPersona(input: {
  tenantId: string;
  createdBy?: string;
  name: string;
  description?: string;
  tone?: string;
  systemPrompt: string;
  avatarUrl?: string;
}): Promise<AiPersona> {
  await ensureSchema();
  const created = await pool.query<AiPersona>(
    `INSERT INTO ai_personas (tenant_id, name, description, tone, system_prompt, avatar_url, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.tenantId,
      input.name.trim(),
      input.description?.trim() || null,
      input.tone?.trim() || null,
      input.systemPrompt.trim(),
      input.avatarUrl?.trim() || null,
      input.createdBy ?? null,
    ]
  );
  return created.rows[0];
}

export async function listAiPersonas(tenantId: string): Promise<AiPersona[]> {
  await ensureSchema();
  const result = await pool.query<AiPersona>(
    `SELECT *
     FROM ai_personas
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId]
  );
  return result.rows;
}

export async function updateAiPersona(input: {
  tenantId: string;
  personaId: string;
  name?: string;
  description?: string;
  tone?: string;
  systemPrompt?: string;
  avatarUrl?: string;
  isActive?: boolean;
}): Promise<AiPersona | null> {
  await ensureSchema();
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  const assign = (column: string, value: unknown) => {
    updates.push(`${column} = $${idx++}`);
    values.push(value);
  };

  if (input.name !== undefined) assign("name", input.name.trim());
  if (input.description !== undefined) assign("description", input.description.trim() || null);
  if (input.tone !== undefined) assign("tone", input.tone.trim() || null);
  if (input.systemPrompt !== undefined) assign("system_prompt", input.systemPrompt.trim());
  if (input.avatarUrl !== undefined) assign("avatar_url", input.avatarUrl.trim() || null);
  if (input.isActive !== undefined) assign("is_active", input.isActive);

  if (updates.length === 0) return null;
  assign("updated_at", new Date().toISOString());
  values.push(input.tenantId);
  values.push(input.personaId);

  const result = await pool.query<AiPersona>(
    `UPDATE ai_personas
     SET ${updates.join(", ")}
     WHERE tenant_id = $${idx++} AND id = $${idx}
     RETURNING *`,
    values
  );
  return result.rows[0] ?? null;
}

export async function createAiScript(input: {
  tenantId: string;
  createdBy?: string;
  personaId: string;
  flowId?: string;
  name: string;
  scriptContent: unknown;
}) {
  await ensureSchema();
  const inserted = await pool.query(
    `INSERT INTO ai_scripts (tenant_id, persona_id, flow_id, name, script_content, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id, tenant_id, persona_id, flow_id, name, script_content, version, is_active, created_by, created_at, updated_at`,
    [
      input.tenantId,
      input.personaId,
      input.flowId ?? null,
      input.name.trim(),
      JSON.stringify(input.scriptContent ?? {}),
      input.createdBy ?? null,
    ]
  );
  return inserted.rows[0];
}

async function resolveProviderForTenant(tenantId: string) {
  await ensureSchema();
  const selected = await pool.query<{
    id: string;
    provider: ProviderName;
    model: string;
    api_key_encrypted: string;
  }>(
    `SELECT id, provider, model, api_key_encrypted
     FROM ai_provider_settings
     WHERE tenant_id = $1 AND is_active = true
     ORDER BY is_default DESC, created_at ASC
     LIMIT 1`,
    [tenantId]
  );
  return selected.rows[0] ?? null;
}

type LlmOutput = {
  text: string;
  requestTokens: number;
  responseTokens: number;
};

async function callOpenAi(input: {
  apiKey: string;
  model: string;
  prompt: string;
  systemPrompt: string;
}): Promise<LlmOutput> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.prompt },
      ],
      temperature: 0.4,
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI status ${response.status}`);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = payload.choices?.[0]?.message?.content?.trim() || "";
  return {
    text,
    requestTokens: payload.usage?.prompt_tokens ?? 0,
    responseTokens: payload.usage?.completion_tokens ?? 0,
  };
}

async function callGemini(input: {
  apiKey: string;
  model: string;
  prompt: string;
  systemPrompt: string;
}): Promise<LlmOutput> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    input.model
  )}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${input.systemPrompt}\n\n${input.prompt}` }] }],
      generationConfig: { temperature: 0.4 },
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemini status ${response.status}`);
  }
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  return {
    text,
    requestTokens: payload.usageMetadata?.promptTokenCount ?? 0,
    responseTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export async function generateAiText(input: {
  tenantId: string;
  personaId: string;
  scriptId?: string;
  message: string;
  conversationId?: string;
}): Promise<{
  text: string;
  provider: ProviderName;
  model: string;
  usage: { requestTokens: number; responseTokens: number };
}> {
  await ensureSchema();
  const provider = await resolveProviderForTenant(input.tenantId);
  if (!provider) {
    throw new ApiError(
      404,
      ERROR_CODES.ai.AI_PROVIDER_NOT_FOUND,
      "Nenhum provedor de IA ativo encontrado para este tenant"
    );
  }

  const personaResult = await pool.query<AiPersona>(
    `SELECT * FROM ai_personas WHERE tenant_id = $1 AND id = $2 AND is_active = true LIMIT 1`,
    [input.tenantId, input.personaId]
  );
  const persona = personaResult.rows[0];
  if (!persona) {
    throw new ApiError(404, ERROR_CODES.ai.AI_PERSONA_NOT_FOUND, "Persona não encontrada");
  }

  let scriptContext = "";
  if (input.scriptId) {
    const scriptRes = await pool.query<{ script_content: unknown }>(
      `SELECT script_content FROM ai_scripts
       WHERE tenant_id = $1 AND id = $2 AND persona_id = $3 AND is_active = true
       LIMIT 1`,
      [input.tenantId, input.scriptId, input.personaId]
    );
    const script = scriptRes.rows[0];
    if (script) {
      scriptContext = `\n\nContexto de roteiro JSON:\n${JSON.stringify(script.script_content)}`;
    }
  }

  const started = Date.now();
  try {
    const apiKey = decryptSecret(provider.api_key_encrypted);
    const finalPrompt = `${input.message.trim()}${scriptContext}`;
    const output =
      provider.provider === "openai"
        ? await callOpenAi({
            apiKey,
            model: provider.model,
            prompt: finalPrompt,
            systemPrompt: persona.system_prompt,
          })
        : await callGemini({
            apiKey,
            model: provider.model,
            prompt: finalPrompt,
            systemPrompt: persona.system_prompt,
          });

    if (!output.text) {
      throw new ApiError(
        502,
        ERROR_CODES.ai.AI_RESPONSE_INVALID,
        "O provedor retornou resposta vazia"
      );
    }

    await pool.query(
      `INSERT INTO ai_usage_logs
       (tenant_id, provider, model, persona_id, conversation_id, request_tokens, response_tokens, latency_ms, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'success')`,
      [
        input.tenantId,
        provider.provider,
        provider.model,
        input.personaId,
        input.conversationId ?? null,
        output.requestTokens,
        output.responseTokens,
        Date.now() - started,
      ]
    );

    return {
      text: output.text,
      provider: provider.provider,
      model: provider.model,
      usage: {
        requestTokens: output.requestTokens,
        responseTokens: output.responseTokens,
      },
    };
  } catch (error) {
    await pool.query(
      `INSERT INTO ai_usage_logs
       (tenant_id, provider, model, persona_id, conversation_id, latency_ms, status, error_code)
       VALUES ($1, $2, $3, $4, $5, $6, 'error', $7)`,
      [
        input.tenantId,
        provider.provider,
        provider.model,
        input.personaId,
        input.conversationId ?? null,
        Date.now() - started,
        error instanceof ApiError ? error.code : ERROR_CODES.ai.AI_RESPONSE_FAILED,
      ]
    );
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, ERROR_CODES.ai.AI_RESPONSE_FAILED, "Falha ao consultar provedor de IA");
  }
}
