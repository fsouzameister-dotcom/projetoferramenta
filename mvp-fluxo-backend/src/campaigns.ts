import { pool } from "./db";
import {
  getOutboundWhatsAppContextForChannel,
  WHATSAPP_PROVIDER_CLOUD,
  WHATSAPP_PROVIDER_TWILIO,
} from "./whatsapp-channels";
import { sendWhatsAppTemplateMessage } from "./whatsapp-cloud-api";
import { sendTwilioWhatsAppContentMessage } from "./whatsapp-twilio-api";
import { ensureConversationProtocol } from "./conversation-protocol";
import { normalizeCampaignPhoneE164, phoneDigitsOnly } from "./campaign-phone";
import { setCampaignInboundRoute } from "./campaign-inbound";
import type { CampaignTemplateOption } from "./campaign-templates";
import {
  buildTemplateParams,
  nextStatusAfterStaleSending,
  STALE_SENDING_MINUTES,
} from "./campaign-utils";

export {
  buildTemplateParams,
  nextStatusAfterStaleSending,
  STALE_SENDING_MINUTES,
} from "./campaign-utils";

export type CampaignTemplateConfig = {
  provider: string;
  templateId: string;
  displayName: string;
  language: string | null;
  variables: string[];
  bodyPreview: string;
  contentSid?: string;
  templateName?: string;
};

export type CampaignMetadata = {
  channelAccountId: string;
  channelLabel?: string;
  provider?: string;
  template: CampaignTemplateConfig;
  columnMapping: Record<string, string>;
  phoneColumn: string;
  sendIntervalSeconds: number;
  spreadsheetHeaders?: string[];
  lastDispatchAt?: string;
};

export type CampaignRow = {
  id: string;
  tenant_id: string;
  name: string;
  channel: string;
  status: string;
  flow_id: string | null;
  scheduled_at: string | null;
  metadata: CampaignMetadata;
  created_at: string;
  updated_at: string;
  stats?: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    responded: number;
  };
};

let schemaReady = false;

export async function ensureCampaignSchema(): Promise<void> {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mailings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      name text NOT NULL,
      channel text NOT NULL DEFAULT 'whatsapp',
      status text NOT NULL DEFAULT 'draft',
      scheduled_at timestamptz,
      flow_id uuid,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mailing_recipients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      mailing_id uuid NOT NULL REFERENCES mailings(id) ON DELETE CASCADE,
      client_id uuid,
      phone_e164 text NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      provider_message_id text,
      error_code text,
      error_description text,
      sent_at timestamptz,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (mailing_id, phone_e164)
    )
  `);
  await pool.query(`
    ALTER TABLE mailing_recipients
    ADD COLUMN IF NOT EXISTS conversation_id uuid
  `);
  await pool.query(`
    ALTER TABLE mailing_recipients
    ADD COLUMN IF NOT EXISTS first_reply_at timestamptz
  `);
  await pool.query(`
    ALTER TABLE mailing_recipients
    ADD COLUMN IF NOT EXISTS first_reply_text text
  `);
  schemaReady = true;
}

function parseMetadata(raw: unknown): CampaignMetadata {
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const template = (m.template ?? {}) as CampaignMetadata["template"];
  return {
    channelAccountId: String(m.channelAccountId ?? ""),
    channelLabel: typeof m.channelLabel === "string" ? m.channelLabel : undefined,
    provider: typeof m.provider === "string" ? m.provider : undefined,
    template,
    columnMapping: (m.columnMapping as Record<string, string>) ?? {},
    phoneColumn: String(m.phoneColumn ?? "Telefone"),
    sendIntervalSeconds: Number(m.sendIntervalSeconds) > 0 ? Number(m.sendIntervalSeconds) : 3,
    spreadsheetHeaders: Array.isArray(m.spreadsheetHeaders)
      ? m.spreadsheetHeaders.map(String)
      : undefined,
    lastDispatchAt: typeof m.lastDispatchAt === "string" ? m.lastDispatchAt : undefined,
  };
}

export type CampaignRecipientRow = {
  id: string;
  phone_e164: string;
  status: string;
  provider_message_id: string | null;
  error_code: string | null;
  error_description: string | null;
  sent_at: string | null;
  first_reply_at: string | null;
  first_reply_text: string | null;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
};

async function attachStats(tenantId: string, campaigns: CampaignRow[]): Promise<CampaignRow[]> {
  if (!campaigns.length) return campaigns;
  const ids = campaigns.map((c) => c.id);
  const stats = await pool.query<{
    mailing_id: string;
    total: string;
    pending: string;
    sent: string;
    failed: string;
    responded: string;
  }>(
    `SELECT mailing_id,
            count(*)::text AS total,
            count(*) FILTER (WHERE status IN ('pending', 'sending'))::text AS pending,
            count(*) FILTER (WHERE status IN ('sent', 'delivered', 'read'))::text AS sent,
            count(*) FILTER (WHERE status = 'failed')::text AS failed,
            count(*) FILTER (WHERE status = 'responded')::text AS responded
     FROM mailing_recipients
     WHERE tenant_id = $1::uuid AND mailing_id = ANY($2::uuid[])
     GROUP BY mailing_id`,
    [tenantId, ids]
  );
  const byId = new Map(stats.rows.map((r) => [r.mailing_id, r]));
  return campaigns.map((c) => {
    const s = byId.get(c.id);
    return {
      ...c,
      stats: s
        ? {
            total: Number(s.total),
            pending: Number(s.pending),
            sent: Number(s.sent),
            failed: Number(s.failed),
            responded: Number(s.responded),
          }
        : { total: 0, pending: 0, sent: 0, failed: 0, responded: 0 },
    };
  });
}

export async function listCampaigns(tenantId: string): Promise<CampaignRow[]> {
  await ensureCampaignSchema();
  const result = await pool.query<CampaignRow>(
    `SELECT id::text, tenant_id::text, name, channel, status,
            flow_id::text, scheduled_at::text, metadata,
            created_at::text, updated_at::text
     FROM mailings
     WHERE tenant_id = $1::uuid
     ORDER BY created_at DESC`,
    [tenantId]
  );
  const rows = result.rows.map((r) => ({
    ...r,
    metadata: parseMetadata(r.metadata),
  }));
  return attachStats(tenantId, rows);
}

export async function getCampaign(
  tenantId: string,
  campaignId: string
): Promise<CampaignRow | null> {
  await ensureCampaignSchema();
  const result = await pool.query<CampaignRow>(
    `SELECT id::text, tenant_id::text, name, channel, status,
            flow_id::text, scheduled_at::text, metadata,
            created_at::text, updated_at::text
     FROM mailings
     WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [tenantId, campaignId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const mapped = { ...row, metadata: parseMetadata(row.metadata) };
  const [withStats] = await attachStats(tenantId, [mapped]);
  return withStats;
}

export async function createCampaign(input: {
  tenantId: string;
  name: string;
  flowId: string;
  channelAccountId: string;
  channelLabel?: string;
  provider?: string;
  template: CampaignTemplateOption;
  columnMapping: Record<string, string>;
  phoneColumn: string;
  sendIntervalSeconds: number;
  spreadsheetHeaders: string[];
  rows: Record<string, string>[];
}): Promise<CampaignRow> {
  await ensureCampaignSchema();
  const metadata: CampaignMetadata = {
    channelAccountId: input.channelAccountId,
    channelLabel: input.channelLabel,
    provider: input.provider ?? input.template.provider,
    template: {
      provider: input.template.provider,
      templateId: input.template.templateId,
      displayName: input.template.displayName,
      language: input.template.language,
      variables: input.template.variables,
      bodyPreview: input.template.bodyPreview,
      contentSid: input.template.contentSid,
      templateName: input.template.templateName,
    },
    columnMapping: input.columnMapping,
    phoneColumn: input.phoneColumn,
    sendIntervalSeconds: Math.max(1, Math.min(120, input.sendIntervalSeconds || 3)),
    spreadsheetHeaders: input.spreadsheetHeaders,
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query<{ id: string }>(
      `INSERT INTO mailings (tenant_id, name, channel, status, flow_id, metadata)
       VALUES ($1::uuid, $2, 'whatsapp', 'draft', $3::uuid, $4::jsonb)
       RETURNING id::text`,
      [input.tenantId, input.name.trim(), input.flowId, JSON.stringify(metadata)]
    );
    const mailingId = created.rows[0].id;

    for (const row of input.rows) {
      const phoneRaw = row[input.phoneColumn];
      const phone = normalizeCampaignPhoneE164(String(phoneRaw ?? ""));
      if (!phone) continue;
      await client.query(
        `INSERT INTO mailing_recipients (tenant_id, mailing_id, phone_e164, status, metadata)
         VALUES ($1::uuid, $2::uuid, $3, 'pending', $4::jsonb)
         ON CONFLICT (mailing_id, phone_e164) DO NOTHING`,
        [input.tenantId, mailingId, phone, JSON.stringify({ row })]
      );
    }

    await client.query("COMMIT");
    const campaign = await getCampaign(input.tenantId, mailingId);
    if (!campaign) throw new Error("CAMPAIGN_CREATE_FAILED");
    return campaign;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

const DISPATCHABLE_STATUSES = new Set(["draft", "paused", "sending", "completed"]);

export async function startCampaignDispatch(
  tenantId: string,
  campaignId: string
): Promise<CampaignRow | null> {
  await ensureCampaignSchema();
  const campaign = await getCampaign(tenantId, campaignId);
  if (!campaign) return null;
  if (!campaign.flow_id) throw new Error("FLOW_REQUIRED");
  if (!campaign.metadata.channelAccountId) throw new Error("CHANNEL_REQUIRED");
  if (campaign.status === "cancelled") throw new Error("CAMPAIGN_CANCELLED");
  if (!DISPATCHABLE_STATUSES.has(campaign.status)) {
    throw new Error("CAMPAIGN_INVALID_STATUS");
  }

  if (campaign.status === "completed") {
    const pending = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM mailing_recipients
       WHERE tenant_id = $1::uuid AND mailing_id = $2::uuid AND status = 'pending'`,
      [tenantId, campaignId]
    );
    if (Number(pending.rows[0]?.n ?? 0) === 0) {
      throw new Error("CAMPAIGN_NO_PENDING");
    }
  }

  await pool.query(
    `UPDATE mailings
     SET status = 'sending',
         metadata = metadata || jsonb_build_object('lastDispatchAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
         updated_at = now()
     WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [campaignId, tenantId]
  );
  return getCampaign(tenantId, campaignId);
}

export async function pauseCampaign(
  tenantId: string,
  campaignId: string
): Promise<CampaignRow | null> {
  await ensureCampaignSchema();
  const result = await pool.query(
    `UPDATE mailings
     SET status = 'paused', updated_at = now()
     WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'sending'
     RETURNING id`,
    [campaignId, tenantId]
  );
  if (!result.rowCount) {
    const existing = await getCampaign(tenantId, campaignId);
    if (!existing) return null;
    throw new Error("CAMPAIGN_INVALID_STATUS");
  }
  return getCampaign(tenantId, campaignId);
}

export async function resumeCampaign(
  tenantId: string,
  campaignId: string
): Promise<CampaignRow | null> {
  await ensureCampaignSchema();
  const campaign = await getCampaign(tenantId, campaignId);
  if (!campaign) return null;
  if (campaign.status !== "paused") throw new Error("CAMPAIGN_INVALID_STATUS");
  return startCampaignDispatch(tenantId, campaignId);
}

export async function cancelCampaign(
  tenantId: string,
  campaignId: string
): Promise<CampaignRow | null> {
  await ensureCampaignSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE mailings
       SET status = 'cancelled', updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid
         AND status IN ('draft', 'sending', 'paused')
       RETURNING id`,
      [campaignId, tenantId]
    );
    if (!updated.rowCount) {
      await client.query("ROLLBACK");
      const existing = await getCampaign(tenantId, campaignId);
      if (!existing) return null;
      throw new Error("CAMPAIGN_INVALID_STATUS");
    }
    await client.query(
      `UPDATE mailing_recipients
       SET status = 'skipped', updated_at = now()
       WHERE tenant_id = $1::uuid AND mailing_id = $2::uuid
         AND status IN ('pending', 'sending')`,
      [tenantId, campaignId]
    );
    await client.query("COMMIT");
    return getCampaign(tenantId, campaignId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function retryFailedRecipients(
  tenantId: string,
  campaignId: string,
  recipientIds?: string[]
): Promise<{ reset: number; campaign: CampaignRow | null }> {
  await ensureCampaignSchema();
  const campaign = await getCampaign(tenantId, campaignId);
  if (!campaign) return { reset: 0, campaign: null };
  if (campaign.status === "cancelled") throw new Error("CAMPAIGN_CANCELLED");

  const params: unknown[] = [tenantId, campaignId];
  let filterByIds = "";
  if (recipientIds?.length) {
    filterByIds = ` AND id = ANY($3::uuid[])`;
    params.push(recipientIds);
  }

  const result = await pool.query(
    `UPDATE mailing_recipients
     SET status = 'pending',
         error_code = NULL,
         error_description = NULL,
         updated_at = now()
     WHERE tenant_id = $1::uuid AND mailing_id = $2::uuid AND status = 'failed'${filterByIds}`,
    params
  );
  const reset = result.rowCount ?? 0;

  if (reset > 0 && ["completed", "paused"].includes(campaign.status)) {
    await pool.query(
      `UPDATE mailings
       SET status = 'sending',
           metadata = metadata || jsonb_build_object('lastDispatchAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
           updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [campaignId, tenantId]
    );
  }

  return { reset, campaign: await getCampaign(tenantId, campaignId) };
}

export async function recoverStaleSendingRecipients(): Promise<number> {
  await ensureCampaignSchema();
  const stale = await pool.query<{
    id: string;
    stale_recoveries: number;
  }>(
    `SELECT id::text,
            COALESCE((metadata->>'staleRecoveries')::int, 0) AS stale_recoveries
     FROM mailing_recipients
     WHERE status = 'sending'
       AND updated_at < now() - ($1::int * interval '1 minute')`,
    [STALE_SENDING_MINUTES]
  );

  let recovered = 0;
  for (const row of stale.rows) {
    const next = nextStatusAfterStaleSending(row.stale_recoveries);
    await pool.query(
      `UPDATE mailing_recipients
       SET status = $2,
           error_description = COALESCE($3, error_description),
           metadata = metadata || jsonb_build_object(
             'staleRecoveries', COALESCE((metadata->>'staleRecoveries')::int, 0) + 1
           ),
           updated_at = now()
       WHERE id = $1::uuid`,
      [row.id, next.status, next.errorDescription ?? null]
    );
    recovered += 1;
  }
  return recovered;
}

export async function listCampaignRecipients(input: {
  tenantId: string;
  campaignId: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{
  items: CampaignRecipientRow[];
  total: number;
  page: number;
  limit: number;
}> {
  await ensureCampaignSchema();
  const campaign = await getCampaign(input.tenantId, input.campaignId);
  if (!campaign) {
    throw new Error("CAMPAIGN_NOT_FOUND");
  }

  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(200, Math.max(1, input.limit ?? 50));
  const offset = (page - 1) * limit;

  const params: unknown[] = [input.tenantId, input.campaignId];
  let statusClause = "";
  if (input.status?.trim()) {
    statusClause = ` AND status = $${params.length + 1}`;
    params.push(input.status.trim());
  }

  const countResult = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total
     FROM mailing_recipients
     WHERE tenant_id = $1::uuid AND mailing_id = $2::uuid${statusClause}`,
    params
  );

  const listParams = [...params, limit, offset];
  const result = await pool.query<CampaignRecipientRow>(
    `SELECT id::text,
            phone_e164,
            status,
            provider_message_id,
            error_code,
            error_description,
            sent_at::text,
            first_reply_at::text,
            first_reply_text,
            conversation_id::text,
            created_at::text,
            updated_at::text
     FROM mailing_recipients
     WHERE tenant_id = $1::uuid AND mailing_id = $2::uuid${statusClause}
     ORDER BY created_at ASC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return {
    items: result.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
    page,
    limit,
  };
}

async function getOrCreateCampaignConversation(input: {
  tenantId: string;
  phone: string;
  contactName?: string;
  campaignId: string;
  flowId: string;
}): Promise<string> {
  const digits = phoneDigitsOnly(input.phone);
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM agent_conversations
     WHERE tenant_id = $1::uuid
       AND lifecycle_status = 'open'
       AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $2
     ORDER BY updated_at DESC
     LIMIT 1`,
    [input.tenantId, digits]
  );
  if (existing.rows[0]?.id) {
    await pool.query(
      `UPDATE agent_conversations
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [
        existing.rows[0].id,
        input.tenantId,
        JSON.stringify({
          bot_only: true,
          campaign_id: input.campaignId,
          campaign_flow_id: input.flowId,
        }),
      ]
    );
    return existing.rows[0].id;
  }

  const created = await pool.query<{ id: string }>(
    `INSERT INTO agent_conversations (tenant_id, contact_name, phone, status, tags, lifecycle_status, metadata)
     VALUES ($1::uuid, $2, $3, 'em_espera', '[]'::jsonb, 'open', $4::jsonb)
     RETURNING id::text`,
    [
      input.tenantId,
      input.contactName?.trim() || input.phone,
      input.phone,
      JSON.stringify({
        bot_only: true,
        campaign_id: input.campaignId,
        campaign_flow_id: input.flowId,
      }),
    ]
  );
  const convId = created.rows[0].id;
  await ensureConversationProtocol({ tenantId: input.tenantId, conversationId: convId });
  return convId;
}

export async function sendCampaignRecipient(input: {
  tenantId: string;
  campaign: CampaignRow;
  recipientId: string;
}): Promise<"sent" | "failed" | "skipped"> {
  const { campaign, tenantId } = input;
  const meta = campaign.metadata;
  if (!campaign.flow_id) return "skipped";

  const recipient = await pool.query<{
    id: string;
    phone_e164: string;
    status: string;
    metadata: { row?: Record<string, string> };
  }>(
    `SELECT id::text, phone_e164, status, metadata
     FROM mailing_recipients
     WHERE id = $1::uuid AND mailing_id = $2::uuid AND tenant_id = $3::uuid`,
    [input.recipientId, campaign.id, tenantId]
  );
  const row = recipient.rows[0];
  if (!row || row.status !== "pending") return "skipped";

  await pool.query(
    `UPDATE mailing_recipients SET status = 'sending', updated_at = now()
     WHERE id = $1::uuid`,
    [row.id]
  );

  const spreadsheetRow = row.metadata?.row ?? {};
  const templateParams = buildTemplateParams(meta.columnMapping, spreadsheetRow);
  const waCtx = await getOutboundWhatsAppContextForChannel(tenantId, meta.channelAccountId);
  if (!waCtx) {
    await pool.query(
      `UPDATE mailing_recipients
       SET status = 'failed', error_description = 'Canal WhatsApp indisponível', updated_at = now()
       WHERE id = $1::uuid`,
      [row.id]
    );
    return "failed";
  }

  const toDigits = phoneDigitsOnly(row.phone_e164);
  const template = meta.template;
  let sendOk = false;
  let messageId = "";
  let errorDescription = "";

  if (waCtx.provider === WHATSAPP_PROVIDER_TWILIO) {
    const contentSid = template.contentSid ?? template.templateId;
    const result = await sendTwilioWhatsAppContentMessage({
      accountSid: waCtx.accountSid,
      authToken: waCtx.authToken,
      fromE164: waCtx.fromE164,
      toDigits,
      contentSid,
      contentVariables: templateParams,
    });
    sendOk = result.ok;
    if (result.ok) messageId = result.messageId;
    else errorDescription = result.message;
  } else if (waCtx.provider === WHATSAPP_PROVIDER_CLOUD) {
    const templateName = template.templateName ?? template.displayName;
    const result = await sendWhatsAppTemplateMessage({
      phoneNumberId: waCtx.phoneNumberId,
      accessToken: waCtx.accessToken,
      toDigits,
      templateName,
      languageCode: template.language ?? "pt_BR",
      templateParams,
    });
    sendOk = result.ok;
    if (result.ok) messageId = result.messageId;
    else errorDescription = result.message;
  }

  if (!sendOk) {
    await pool.query(
      `UPDATE mailing_recipients
       SET status = 'failed',
           error_description = $2,
           updated_at = now()
       WHERE id = $1::uuid`,
      [row.id, errorDescription.slice(0, 500)]
    );
    return "failed";
  }

  const conversationId = await getOrCreateCampaignConversation({
    tenantId,
    phone: row.phone_e164,
    campaignId: campaign.id,
    flowId: campaign.flow_id,
  });

  await pool.query(
    `INSERT INTO agent_messages
     (conversation_id, tenant_id, provider_message_id, type, direction, sender_name, delivery_status, text_content, metadata)
     VALUES ($1::uuid, $2::uuid, $3, 'text', 'out', 'Campanha', 'sent', $4, $5::jsonb)`,
    [
      conversationId,
      tenantId,
      messageId,
      meta.template.bodyPreview || `Template: ${meta.template.displayName}`,
      JSON.stringify({
        source: "campaign",
        mailing_id: campaign.id,
        recipient_id: row.id,
        template_params: templateParams,
      }),
    ]
  );

  await pool.query(
    `UPDATE mailing_recipients
     SET status = 'sent',
         provider_message_id = $2,
         sent_at = now(),
         conversation_id = $3::uuid,
         updated_at = now()
     WHERE id = $1::uuid`,
    [row.id, messageId, conversationId]
  );

  await setCampaignInboundRoute({
    tenantId,
    phone: row.phone_e164,
    flowId: campaign.flow_id,
    mailingId: campaign.id,
    recipientId: row.id,
    conversationId,
  });

  return "sent";
}

export async function pickNextPendingRecipient(
  tenantId: string,
  campaignId: string
): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id::text FROM mailing_recipients
     WHERE tenant_id = $1::uuid AND mailing_id = $2::uuid AND status = 'pending'
     ORDER BY created_at ASC
     LIMIT 1`,
    [tenantId, campaignId]
  );
  return result.rows[0]?.id ?? null;
}

export async function finalizeCampaignIfDone(
  tenantId: string,
  campaignId: string
): Promise<void> {
  const pending = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM mailing_recipients
     WHERE tenant_id = $1::uuid AND mailing_id = $2::uuid
       AND status IN ('pending', 'sending')`,
    [tenantId, campaignId]
  );
  if (Number(pending.rows[0]?.n ?? 0) > 0) return;
  await pool.query(
    `UPDATE mailings SET status = 'completed', updated_at = now()
     WHERE id = $1::uuid AND tenant_id = $2::uuid AND status = 'sending'`,
    [campaignId, tenantId]
  );
}

export async function listActiveSendingCampaigns(): Promise<
  Array<{ tenantId: string; campaignId: string; intervalSeconds: number }>
> {
  await ensureCampaignSchema();
  const result = await pool.query<{
    tenant_id: string;
    id: string;
    metadata: CampaignMetadata;
  }>(
    `SELECT tenant_id::text, id::text, metadata
     FROM mailings
     WHERE status = 'sending'
     ORDER BY updated_at ASC`
  );
  return result.rows.map((r) => ({
    tenantId: r.tenant_id,
    campaignId: r.id,
    intervalSeconds: parseMetadata(r.metadata).sendIntervalSeconds || 3,
  }));
}
