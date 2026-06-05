import { createHash } from "node:crypto";
import { pool } from "./db";
import { redis } from "./redis";
import { phoneDigitsOnly } from "./agent-conversations";

/** Mesmo texto para o mesmo número — não reenviar. */
const DEDUP_WINDOW_SEC = 10 * 60;
/** Circuit breaker: mesmo texto + mesmo número. */
const CIRCUIT_SAME_PHONE_COUNT = 5;
const CIRCUIT_SAME_PHONE_WINDOW_SEC = 5 * 60;
/** Circuit breaker: mesmo texto para muitos números (loop/campanha acidental). */
const CIRCUIT_MULTI_PHONE_COUNT = 10;
const CIRCUIT_MULTI_PHONE_WINDOW_SEC = 2 * 60;

export type BotPauseSource = "manual" | "circuit_breaker";

export type BotSafeguardStatus = {
  tenantId: string;
  paused: boolean;
  pauseReason: string | null;
  pausedAt: string | null;
  pauseSource: BotPauseSource | null;
  updatedAt: string;
};

export type BotOutboundCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; code: string };

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_service_settings (
        tenant_id uuid PRIMARY KEY,
        closure_message_template text NOT NULL DEFAULT '',
        return_lookup_days integer NOT NULL DEFAULT 7,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE tenant_service_settings
      ADD COLUMN IF NOT EXISTS bot_outbound_paused boolean NOT NULL DEFAULT false
    `);
    await client.query(`
      ALTER TABLE tenant_service_settings
      ADD COLUMN IF NOT EXISTS bot_outbound_pause_reason text
    `);
    await client.query(`
      ALTER TABLE tenant_service_settings
      ADD COLUMN IF NOT EXISTS bot_outbound_paused_at timestamptz
    `);
    await client.query(`
      ALTER TABLE tenant_service_settings
      ADD COLUMN IF NOT EXISTS bot_outbound_pause_source text
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

function normalizeOutboundBody(body: string): string {
  return body.trim().toLowerCase().replace(/\s+/g, " ");
}

function bodyHash(body: string): string {
  const normalized = normalizeOutboundBody(body);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function dedupKey(tenantId: string, phone: string, hash: string): string {
  return `bot:dedup:${tenantId}:${phone}:${hash}`;
}

function samePhoneTextKey(tenantId: string, phone: string, hash: string): string {
  return `bot:circuit:phone:${tenantId}:${phone}:${hash}`;
}

function sameTextPhonesKey(tenantId: string, hash: string): string {
  return `bot:circuit:phones:${tenantId}:${hash}`;
}

export async function getBotSafeguardStatus(tenantId: string): Promise<BotSafeguardStatus> {
  await ensureSchema();
  const result = await pool.query<{
    tenant_id: string;
    bot_outbound_paused: boolean;
    bot_outbound_pause_reason: string | null;
    bot_outbound_paused_at: Date | string | null;
    bot_outbound_pause_source: string | null;
    updated_at: Date | string;
  }>(
    `SELECT tenant_id, bot_outbound_paused, bot_outbound_pause_reason,
            bot_outbound_paused_at, bot_outbound_pause_source, updated_at
     FROM tenant_service_settings
     WHERE tenant_id = $1::uuid`,
    [tenantId]
  );

  const row = result.rows[0];
  if (!row) {
    return {
      tenantId,
      paused: false,
      pauseReason: null,
      pausedAt: null,
      pauseSource: null,
      updatedAt: new Date().toISOString(),
    };
  }

  const source = row.bot_outbound_pause_source;
  const pauseSource: BotPauseSource | null =
    source === "manual" || source === "circuit_breaker" ? source : null;

  return {
    tenantId: String(row.tenant_id),
    paused: Boolean(row.bot_outbound_paused),
    pauseReason: row.bot_outbound_pause_reason,
    pausedAt: row.bot_outbound_paused_at
      ? row.bot_outbound_paused_at instanceof Date
        ? row.bot_outbound_paused_at.toISOString()
        : String(row.bot_outbound_paused_at)
      : null,
    pauseSource,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

async function ensureSettingsRow(tenantId: string): Promise<void> {
  await pool.query(
    `INSERT INTO tenant_service_settings (tenant_id, closure_message_template, return_lookup_days)
     VALUES ($1::uuid, $2, 7)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [
      tenantId,
      "Seu atendimento foi encerrado. Protocolo: {{protocolo}}. Obrigado pelo contato.",
    ]
  );
}

export async function setBotSafeguardPaused(input: {
  tenantId: string;
  paused: boolean;
  reason?: string | null;
  source?: BotPauseSource | null;
}): Promise<BotSafeguardStatus> {
  await ensureSchema();
  await ensureSettingsRow(input.tenantId);

  if (input.paused) {
    await pool.query(
      `UPDATE tenant_service_settings
       SET bot_outbound_paused = true,
           bot_outbound_pause_reason = $2,
           bot_outbound_paused_at = now(),
           bot_outbound_pause_source = $3,
           updated_at = now()
       WHERE tenant_id = $1::uuid`,
      [
        input.tenantId,
        input.reason?.trim() || "Pausado manualmente pelo administrador.",
        input.source ?? "manual",
      ]
    );
  } else {
    await pool.query(
      `UPDATE tenant_service_settings
       SET bot_outbound_paused = false,
           bot_outbound_pause_reason = NULL,
           bot_outbound_paused_at = NULL,
           bot_outbound_pause_source = NULL,
           updated_at = now()
       WHERE tenant_id = $1::uuid`,
      [input.tenantId]
    );
  }

  return getBotSafeguardStatus(input.tenantId);
}

async function triggerCircuitBreakerPause(
  tenantId: string,
  reason: string
): Promise<void> {
  await setBotSafeguardPaused({
    tenantId,
    paused: true,
    reason,
    source: "circuit_breaker",
  });
}

async function incrWithTtl(key: string, ttlSec: number): Promise<number> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, ttlSec);
  }
  return count;
}

/**
 * Verifica salvaguardas anti-spam do bot e registra o envio se permitido.
 * Não afeta envios do agente humano.
 */
export async function checkAndRecordBotOutbound(input: {
  tenantId: string;
  toPhone: string;
  body: string;
}): Promise<BotOutboundCheckResult> {
  const phone = phoneDigitsOnly(input.toPhone);
  const body = input.body?.trim();
  if (!phone || !body) {
    return { allowed: false, reason: "Destino ou conteúdo inválido.", code: "INVALID" };
  }

  const status = await getBotSafeguardStatus(input.tenantId);
  if (status.paused) {
    return {
      allowed: false,
      reason: status.pauseReason || "Envio do bot pausado.",
      code: "BOT_PAUSED",
    };
  }

  const hash = bodyHash(body);

  try {
    const dedupExists = await redis.exists(dedupKey(input.tenantId, phone, hash));
    if (dedupExists) {
      return {
        allowed: false,
        reason: "Mensagem idêntica já enviada para este contato recentemente.",
        code: "DUPLICATE_CONTENT",
      };
    }

    const samePhoneKey = samePhoneTextKey(input.tenantId, phone, hash);
    const samePhoneCount = Number(await redis.get(samePhoneKey)) || 0;
    if (samePhoneCount >= CIRCUIT_SAME_PHONE_COUNT) {
      await triggerCircuitBreakerPause(
        input.tenantId,
        `Circuit breaker: ${CIRCUIT_SAME_PHONE_COUNT} mensagens iguais para +${phone} em ${CIRCUIT_SAME_PHONE_WINDOW_SEC / 60} min.`
      );
      return {
        allowed: false,
        reason: "Circuit breaker ativado: repetição excessiva para o mesmo contato.",
        code: "CIRCUIT_BREAKER",
      };
    }

    const phonesKey = sameTextPhonesKey(input.tenantId, hash);
    const distinctBefore = await redis.scard(phonesKey);
    if (distinctBefore >= CIRCUIT_MULTI_PHONE_COUNT) {
      await triggerCircuitBreakerPause(
        input.tenantId,
        `Circuit breaker: mesmo texto enviado para ${distinctBefore} contatos em ${CIRCUIT_MULTI_PHONE_WINDOW_SEC / 60} min.`
      );
      return {
        allowed: false,
        reason: "Circuit breaker ativado: mesmo texto para muitos contatos.",
        code: "CIRCUIT_BREAKER",
      };
    }

    await redis.set(dedupKey(input.tenantId, phone, hash), "1", "EX", DEDUP_WINDOW_SEC);
    await incrWithTtl(samePhoneKey, CIRCUIT_SAME_PHONE_WINDOW_SEC);
    await redis.sadd(phonesKey, phone);
    await redis.expire(phonesKey, CIRCUIT_MULTI_PHONE_WINDOW_SEC);
  } catch {
    /* Redis indisponível — segue com pausa apenas via DB */
  }

  return { allowed: true };
}
