import { pool } from "./db";
import { ensureTelephonySchema } from "./telephony-schema";
import {
  DEFAULT_CAMPAIGN_TABULACOES,
  VOICE_CONTACT_OUTCOMES,
  type VoiceContactOutcome,
} from "./voice-campaign-rules";

export type VoiceCampaignTabulacao = {
  id: string;
  campaignId: string;
  label: string;
  description: string | null;
  outcome: VoiceContactOutcome;
  isSuccess: boolean;
  sortOrder: number;
  active: boolean;
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

function mapTab(row: Record<string, unknown>): VoiceCampaignTabulacao {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    label: String(row.label),
    description: row.description ? String(row.description) : null,
    outcome: String(row.outcome) as VoiceContactOutcome,
    isSuccess: Boolean(row.is_success),
    sortOrder: Number(row.sort_order ?? 0),
    active: Boolean(row.active),
  };
}

function normalizeOutcome(raw: unknown, fallback: VoiceContactOutcome): VoiceContactOutcome {
  return VOICE_CONTACT_OUTCOMES.includes(raw as VoiceContactOutcome) ? (raw as VoiceContactOutcome) : fallback;
}

/** Garante as tabulações iniciais da campanha (só quando ela ainda não tem nenhuma, nem inativa). */
export async function seedCampaignTabulacoes(tenantId: string, campaignId: string): Promise<void> {
  await pool.query(
    `INSERT INTO voice_campaign_tabulacoes (tenant_id, campaign_id, label, description, outcome, is_success, sort_order)
     SELECT $1::uuid, $2::uuid, t.label, t.description, t.outcome, t.is_success, t.sort_order
     FROM unnest($3::text[], $4::text[], $5::text[], $6::boolean[], $7::int[])
       AS t(label, description, outcome, is_success, sort_order)
     WHERE NOT EXISTS (SELECT 1 FROM voice_campaign_tabulacoes WHERE campaign_id = $2::uuid)`,
    [
      tenantId,
      campaignId,
      DEFAULT_CAMPAIGN_TABULACOES.map((t) => t.label),
      DEFAULT_CAMPAIGN_TABULACOES.map((t) => t.description),
      DEFAULT_CAMPAIGN_TABULACOES.map((t) => t.outcome),
      DEFAULT_CAMPAIGN_TABULACOES.map((t) => t.isSuccess),
      DEFAULT_CAMPAIGN_TABULACOES.map((_, idx) => (idx + 1) * 10),
    ]
  );
}

async function assertCampaign(tenantId: string, campaignId: string): Promise<void> {
  if (!UUID_RE.test(campaignId)) throw new Error("VOICE_CAMPAIGN_NOT_FOUND");
  const found = await pool.query(`SELECT 1 FROM voice_campaigns WHERE id = $1::uuid AND tenant_id = $2::uuid`, [
    campaignId,
    tenantId,
  ]);
  if (!found.rows[0]) throw new Error("VOICE_CAMPAIGN_NOT_FOUND");
}

export async function listCampaignTabulacoes(input: {
  tenantId: string;
  campaignId: string;
  onlyActive?: boolean;
}): Promise<VoiceCampaignTabulacao[]> {
  await ensureTelephonySchema();
  await assertCampaign(input.tenantId, input.campaignId);
  await seedCampaignTabulacoes(input.tenantId, input.campaignId);
  const result = await pool.query(
    `SELECT * FROM voice_campaign_tabulacoes
     WHERE campaign_id = $1::uuid ${input.onlyActive ? "AND active = true" : ""}
     ORDER BY active DESC, sort_order ASC, created_at ASC`,
    [input.campaignId]
  );
  return result.rows.map(mapTab);
}

export async function getCampaignTabulacao(
  campaignId: string,
  tabulacaoId: string
): Promise<VoiceCampaignTabulacao | null> {
  if (!UUID_RE.test(tabulacaoId)) return null;
  const result = await pool.query(
    `SELECT * FROM voice_campaign_tabulacoes WHERE id = $1::uuid AND campaign_id = $2::uuid AND active = true`,
    [tabulacaoId, campaignId]
  );
  return result.rows[0] ? mapTab(result.rows[0]) : null;
}

export async function createCampaignTabulacao(input: {
  tenantId: string;
  campaignId: string;
  label?: unknown;
  description?: unknown;
  outcome?: unknown;
  isSuccess?: unknown;
}): Promise<VoiceCampaignTabulacao> {
  await ensureTelephonySchema();
  await assertCampaign(input.tenantId, input.campaignId);
  await seedCampaignTabulacoes(input.tenantId, input.campaignId);
  const label = String(input.label ?? "").trim().slice(0, 80);
  if (!label) throw new Error("VOICE_TABULACAO_LABEL_REQUIRED");
  const description = String(input.description ?? "").trim().slice(0, 200) || null;
  const result = await pool.query(
    `INSERT INTO voice_campaign_tabulacoes (tenant_id, campaign_id, label, description, outcome, is_success, sort_order)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6,
       COALESCE((SELECT max(sort_order) FROM voice_campaign_tabulacoes WHERE campaign_id = $2::uuid), 0) + 10)
     RETURNING *`,
    [input.tenantId, input.campaignId, label, description, normalizeOutcome(input.outcome, "done"), input.isSuccess === true]
  );
  return mapTab(result.rows[0]);
}

export async function updateCampaignTabulacao(input: {
  tenantId: string;
  campaignId: string;
  tabulacaoId: string;
  label?: unknown;
  description?: unknown;
  outcome?: unknown;
  isSuccess?: unknown;
  active?: unknown;
  sortOrder?: unknown;
}): Promise<VoiceCampaignTabulacao> {
  await ensureTelephonySchema();
  await assertCampaign(input.tenantId, input.campaignId);
  if (!UUID_RE.test(input.tabulacaoId)) throw new Error("VOICE_TABULACAO_NOT_FOUND");
  const current = await pool.query(
    `SELECT * FROM voice_campaign_tabulacoes WHERE id = $1::uuid AND campaign_id = $2::uuid`,
    [input.tabulacaoId, input.campaignId]
  );
  if (!current.rows[0]) throw new Error("VOICE_TABULACAO_NOT_FOUND");
  const cur = mapTab(current.rows[0]);
  const label = input.label === undefined ? cur.label : String(input.label ?? "").trim().slice(0, 80);
  if (!label) throw new Error("VOICE_TABULACAO_LABEL_REQUIRED");
  const description =
    input.description === undefined ? cur.description : String(input.description ?? "").trim().slice(0, 200) || null;
  const sortOrder = Number.isFinite(Number(input.sortOrder)) && input.sortOrder !== undefined ? Number(input.sortOrder) : cur.sortOrder;
  const result = await pool.query(
    `UPDATE voice_campaign_tabulacoes
     SET label = $3, description = $4, outcome = $5, is_success = $6, active = $7, sort_order = $8, updated_at = now()
     WHERE id = $1::uuid AND campaign_id = $2::uuid
     RETURNING *`,
    [
      input.tabulacaoId,
      input.campaignId,
      label,
      description,
      normalizeOutcome(input.outcome, cur.outcome),
      input.isSuccess === undefined ? cur.isSuccess : input.isSuccess === true,
      input.active === undefined ? cur.active : input.active === true,
      Math.trunc(sortOrder),
    ]
  );
  return mapTab(result.rows[0]);
}
