import { pool } from "./db";
import { redis } from "./redis";
import { phoneDigitsOnly } from "./campaign-phone";

const ROUTE_PREFIX = "campaign:route:";
const ROUTE_TTL_SEC = 60 * 60 * 24 * 30;

export type CampaignInboundRoute = {
  flowId: string;
  mailingId: string;
  recipientId: string;
  conversationId?: string;
};

function routeKey(tenantId: string, phoneDigits: string): string {
  return `${ROUTE_PREFIX}${tenantId}:${phoneDigits}`;
}

export async function setCampaignInboundRoute(input: {
  tenantId: string;
  phone: string;
  flowId: string;
  mailingId: string;
  recipientId: string;
  conversationId?: string;
}): Promise<void> {
  const digits = phoneDigitsOnly(input.phone);
  if (!digits) return;
  const payload: CampaignInboundRoute = {
    flowId: input.flowId,
    mailingId: input.mailingId,
    recipientId: input.recipientId,
    conversationId: input.conversationId,
  };
  try {
    await redis.set(routeKey(input.tenantId, digits), JSON.stringify(payload), "EX", ROUTE_TTL_SEC);
  } catch {
    /* Redis opcional */
  }
}

export async function resolveCampaignInboundRoute(input: {
  tenantId: string;
  phone?: string;
}): Promise<CampaignInboundRoute | null> {
  const digits = input.phone?.trim() ? phoneDigitsOnly(input.phone) : "";
  if (!digits) return null;

  try {
    const cached = await redis.get(routeKey(input.tenantId, digits));
    if (cached) {
      const parsed = JSON.parse(cached) as CampaignInboundRoute;
      if (parsed?.flowId && parsed?.mailingId && parsed?.recipientId) {
        const stillActive = await pool.query<{ ok: number }>(
          `SELECT 1 AS ok
           FROM mailing_recipients
           WHERE id = $1::uuid
             AND tenant_id = $2::uuid
             AND status IN ('sent', 'delivered', 'read')
           LIMIT 1`,
          [parsed.recipientId, input.tenantId]
        );
        if (stillActive.rows[0]?.ok) return parsed;
        await clearCampaignInboundRoute(input.tenantId, digits);
      }
    }
  } catch {
    /* ignore */
  }

  const result = await pool.query<{
    recipient_id: string;
    mailing_id: string;
    flow_id: string;
    conversation_id: string | null;
  }>(
    `SELECT mr.id AS recipient_id,
            mr.mailing_id,
            m.flow_id::text AS flow_id,
            mr.conversation_id::text AS conversation_id
     FROM mailing_recipients mr
     JOIN mailings m ON m.id = mr.mailing_id
     WHERE mr.tenant_id = $1::uuid
       AND regexp_replace(mr.phone_e164, '[^0-9]', '', 'g') = $2
       AND mr.status IN ('sent', 'delivered', 'read')
       AND mr.sent_at IS NOT NULL
       AND mr.sent_at >= now() - interval '30 days'
       AND m.flow_id IS NOT NULL
     ORDER BY mr.sent_at DESC
     LIMIT 1`,
    [input.tenantId, digits]
  );
  const row = result.rows[0];
  if (!row?.flow_id) return null;
  const route: CampaignInboundRoute = {
    flowId: row.flow_id,
    mailingId: row.mailing_id,
    recipientId: row.recipient_id,
    conversationId: row.conversation_id ?? undefined,
  };
  try {
    await redis.set(
      routeKey(input.tenantId, digits),
      JSON.stringify(route),
      "EX",
      ROUTE_TTL_SEC
    );
  } catch {
    /* Redis opcional */
  }
  return route;
}

export async function markCampaignRecipientResponded(input: {
  tenantId: string;
  phone?: string;
  recipientId?: string;
  messageText: string;
  timestampIso: string;
}): Promise<void> {
  const digits = input.phone?.trim() ? phoneDigitsOnly(input.phone) : "";
  const text = input.messageText.trim();
  if (!text) return;

  if (input.recipientId) {
    await pool.query(
      `UPDATE mailing_recipients
       SET status = CASE WHEN status IN ('read', 'delivered', 'sent') THEN 'responded' ELSE status END,
           first_reply_at = COALESCE(first_reply_at, $3::timestamptz),
           first_reply_text = COALESCE(first_reply_text, $4),
           updated_at = now()
       WHERE id = $1::uuid AND tenant_id = $2::uuid
         AND first_reply_at IS NULL`,
      [input.recipientId, input.tenantId, input.timestampIso, text]
    );
    if (digits) {
      await clearCampaignInboundRoute(input.tenantId, digits);
    }
    return;
  }

  if (!digits) return;
  await pool.query(
    `UPDATE mailing_recipients
     SET status = CASE WHEN status IN ('read', 'delivered', 'sent') THEN 'responded' ELSE status END,
         first_reply_at = COALESCE(first_reply_at, $3::timestamptz),
         first_reply_text = COALESCE(first_reply_text, $4),
         updated_at = now()
     WHERE tenant_id = $1::uuid
       AND regexp_replace(phone_e164, '[^0-9]', '', 'g') = $2
       AND sent_at IS NOT NULL
       AND first_reply_at IS NULL
       AND status NOT IN ('pending', 'failed', 'skipped')`,
    [input.tenantId, digits, input.timestampIso, text]
  );
  await clearCampaignInboundRoute(input.tenantId, digits);
}

export async function clearCampaignInboundRoute(
  tenantId: string,
  phoneDigits: string
): Promise<void> {
  const digits = phoneDigitsOnly(phoneDigits);
  if (!digits) return;
  try {
    await redis.del(routeKey(tenantId, digits));
  } catch {
    /* Redis opcional */
  }
}

export async function syncCampaignRecipientDeliveryStatus(input: {
  tenantId: string;
  providerMessageId: string;
  deliveryStatus: string;
}): Promise<void> {
  const status = input.deliveryStatus.trim().toLowerCase();
  if (!status || !input.providerMessageId.trim()) return;

  let mapped = status;
  if (status === "sending") mapped = "sent";
  if (!["sent", "delivered", "read", "failed"].includes(mapped)) return;

  await pool.query(
    `UPDATE mailing_recipients
     SET status = CASE
           WHEN status = 'responded' THEN status
           WHEN $3 = 'failed' THEN 'failed'
           WHEN $3 = 'read' THEN 'read'
           WHEN $3 = 'delivered' AND status NOT IN ('read', 'responded') THEN 'delivered'
           WHEN $3 = 'sent' AND status IN ('pending', 'sending') THEN 'sent'
           ELSE status
         END,
         updated_at = now()
     WHERE tenant_id = $1::uuid
       AND provider_message_id = $2`,
    [input.tenantId, input.providerMessageId.trim(), mapped]
  );
}
