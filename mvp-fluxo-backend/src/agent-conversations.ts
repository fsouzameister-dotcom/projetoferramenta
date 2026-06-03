import { pool } from "./db";
import {
  getOutboundWhatsAppContext,
  WHATSAPP_PROVIDER_CLOUD,
  WHATSAPP_PROVIDER_TWILIO,
} from "./whatsapp-channels";
import { prepareOutboundAgentAudio } from "./agent-audio-convert";
import {
  mimeToExtension,
  saveAgentMediaFile,
  type AgentAttachmentPayload,
  type AgentAudioPayload,
  type AgentImagePayload,
} from "./agent-media";
import { parseVcardContact } from "./agent-vcard";
import {
  downloadWhatsAppMediaBuffer,
  getWhatsAppMediaUrl,
  sendWhatsAppAudioMessage,
  sendWhatsAppContactMessage,
  sendWhatsAppDocumentMessage,
  sendWhatsAppImageMessage,
  sendWhatsAppLocationMessage,
  sendWhatsAppTextMessage,
  uploadWhatsAppMedia,
} from "./whatsapp-cloud-api";
import {
  downloadTwilioMediaBuffer,
  sendTwilioWhatsAppMediaMessage,
  sendTwilioWhatsAppTextMessage,
} from "./whatsapp-twilio-api";
import { ensureConversationProtocol } from "./conversation-protocol";
import { assertTabulacaoAllowedForQueue } from "./tabulacoes";
import {
  getTenantServiceSettings,
  renderClosureMessageTemplate,
} from "./tenant-service-settings";
import { ensureDefaultQueue } from "./service-queues";
import {
  buildTemplateMessageText,
  formatTemplateErrorDescription,
  sendOutboundTemplateMessage,
} from "./agent-template-outbound";

export type AgentConversationStatus = "em_espera" | "em_andamento" | "historico";
export type AgentMessageType = "text" | "contact" | "location" | "image" | "audio" | "attachment";
export type AgentMessageDirection = "in" | "out";
export type AgentMessageDelivery = "sending" | "sent" | "delivered" | "read" | "failed";
export type AgentConversationLifecycleStatus = "open" | "closed_manual" | "closed_window";

export type AgentMessage = {
  id: string;
  provider_message_id?: string;
  type: AgentMessageType;
  direction: AgentMessageDirection;
  sender_name?: string;
  delivery?: AgentMessageDelivery;
  text?: string;
  createdAt: string;
  contact?: { name: string; phone: string };
  location?: { label: string; lat: number; lng: number };
  image?: AgentImagePayload;
  audio?: AgentAudioPayload;
  attachment?: AgentAttachmentPayload;
  error_code?: string;
  error_description?: string;
};

export type AgentConversation = {
  id: string;
  contactName: string;
  phone: string;
  status: AgentConversationStatus;
  lifecycle_status: AgentConversationLifecycleStatus;
  closed_at?: string;
  closed_by?: string;
  last_customer_message_at?: string;
  window_expires_at?: string;
  outside_service_window: boolean;
  requires_template_to_resume: boolean;
  protocol_number?: string;
  tabulacao_id?: string;
  tabulacao_label?: string;
  closure_message_status?: string;
  tags?: string[];
  metadata?: {
    queue?: string;
    templateName?: string;
    templateParams?: Record<string, string>;
  };
  messages: AgentMessage[];
};

export class AgentConversationRuleError extends Error {
  code:
    | "CONVERSATION_CLOSED"
    | "WINDOW_CLOSED_TEMPLATE_REQUIRED"
    | "TABULACAO_REQUIRED"
    | "TABULACAO_NOT_ALLOWED";
  constructor(
    code:
      | "CONVERSATION_CLOSED"
      | "WINDOW_CLOSED_TEMPLATE_REQUIRED"
      | "TABULACAO_REQUIRED"
      | "TABULACAO_NOT_ALLOWED",
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        contact_name text NOT NULL,
        phone text NOT NULL,
        status text NOT NULL DEFAULT 'em_espera',
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
        tenant_id uuid NOT NULL,
        type text NOT NULL,
        direction text NOT NULL,
        delivery_status text,
        text_content text,
        contact_payload jsonb,
        location_payload jsonb,
        error_code text,
        error_description text,
        metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE agent_messages
      ADD COLUMN IF NOT EXISTS provider_message_id text
    `);
    await client.query(`
      ALTER TABLE agent_messages
      ADD COLUMN IF NOT EXISTS sender_name text
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS metadata jsonb
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'open'
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS closed_at timestamptz
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS closed_by text
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz
    `);
    await client.query(`
      ALTER TABLE agent_conversations
      ADD COLUMN IF NOT EXISTS window_expires_at timestamptz
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_msg_tenant_wamid
      ON agent_messages (tenant_id, provider_message_id)
      WHERE provider_message_id LIKE 'wamid.%'
    `);
    await client.query(`
      ALTER TABLE agent_messages
      ADD COLUMN IF NOT EXISTS image_payload jsonb
    `);
    await client.query(`
      ALTER TABLE agent_messages
      ADD COLUMN IF NOT EXISTS audio_payload jsonb
    `);
    await client.query(`
      ALTER TABLE agent_messages
      ADD COLUMN IF NOT EXISTS attachment_payload jsonb
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

function hhmm(isoDate: string) {
  return new Date(isoDate).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** wa_id da Meta → mesmo formato amigável (+ e dígitos). */
export function normalizeWaIdToPhone(waId: string): string {
  const d = waId.replace(/\D/g, "");
  return d ? `+${d}` : waId.trim();
}

/** Apenas dígitos (ex.: comparar conversa salva com ou sem máscara). */
export function phoneDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

async function ensureTenantSeed(tenantId: string) {
  await ensureSchema();
  await ensureDefaultQueue(tenantId);
  const client = await pool.connect();
  try {
    const exists = await client.query(`SELECT id FROM agent_conversations WHERE tenant_id = $1 LIMIT 1`, [
      tenantId,
    ]);
    if (exists.rows.length > 0) return;

    const created = await client.query<{ id: string }>(
      `INSERT INTO agent_conversations (tenant_id, contact_name, phone, status, tags)
       VALUES ($1, $2, $3, 'em_espera', '["Novo"]'::jsonb)
       RETURNING id`,
      [tenantId, "Lead WhatsApp", "+55 11 98888-1000"]
    );
    const nowIso = new Date().toISOString();
    await client.query(
      `INSERT INTO agent_messages (conversation_id, tenant_id, type, direction, text_content, delivery_status, created_at)
       VALUES ($1, $2, 'text', 'in', $3, 'read', $4::timestamptz)`,
      [created.rows[0].id, tenantId, "Olá, quero informações sobre o plano.", nowIso]
    );
    await client.query(
      `UPDATE agent_conversations
       SET last_customer_message_at = $1::timestamptz,
           window_expires_at = ($1::timestamptz + interval '24 hours'),
           updated_at = now()
       WHERE id = $2 AND tenant_id = $3`,
      [nowIso, created.rows[0].id, tenantId]
    );
  } finally {
    client.release();
  }
}

async function syncWindowClosure(tenantId: string) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE agent_conversations
       SET lifecycle_status = 'closed_window',
           status = 'historico',
           closed_at = COALESCE(closed_at, now()),
           closed_by = COALESCE(closed_by, 'system:auto_window')
       WHERE tenant_id = $1
         AND lifecycle_status = 'open'
         AND window_expires_at IS NOT NULL
         AND window_expires_at <= now()`,
      [tenantId]
    );
  } finally {
    client.release();
  }
}

export async function listAgentConversations(tenantId: string): Promise<AgentConversation[]> {
  await ensureTenantSeed(tenantId);
  await syncWindowClosure(tenantId);
  const client = await pool.connect();
  try {
    const convs = await client.query<{
      id: string;
      contact_name: string;
      phone: string;
      status: AgentConversationStatus;
      lifecycle_status: AgentConversationLifecycleStatus;
      closed_at: string | null;
      closed_by: string | null;
      last_customer_message_at: string | null;
      window_expires_at: string | null;
      protocol_number: string | null;
      tabulacao_id: string | null;
      tabulacao_label: string | null;
      closure_message_status: string | null;
      tags: string[];
      metadata: {
        queue?: string;
        templateName?: string;
        templateParams?: Record<string, string>;
      } | null;
      updated_at: string;
    }>(
      `SELECT id, contact_name, phone, status, lifecycle_status, closed_at, closed_by,
              last_customer_message_at, window_expires_at, protocol_number, tabulacao_id,
              tabulacao_label, closure_message_status, tags, metadata, updated_at
       FROM agent_conversations
       WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
      [tenantId]
    );

    const msgs = await client.query<{
      id: string;
      provider_message_id: string | null;
      conversation_id: string;
      type: AgentMessageType;
      direction: AgentMessageDirection;
      sender_name: string | null;
      delivery_status: AgentMessageDelivery | null;
      text_content: string | null;
      contact_payload: { name: string; phone: string } | null;
      location_payload: { label: string; lat: number; lng: number } | null;
      image_payload: AgentImagePayload | null;
      audio_payload: AgentAudioPayload | null;
      attachment_payload: AgentAttachmentPayload | null;
      error_code: string | null;
      error_description: string | null;
      created_at: string;
    }>(
      `SELECT id, provider_message_id, conversation_id, type, direction, sender_name, delivery_status, text_content, contact_payload,
              location_payload, image_payload, audio_payload, attachment_payload,
              error_code, error_description, created_at
       FROM agent_messages
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
      [tenantId]
    );

    const byConversation = new Map<string, AgentMessage[]>();
    for (const msg of msgs.rows) {
      const list = byConversation.get(msg.conversation_id) ?? [];
      list.push({
        id: msg.id,
        provider_message_id: msg.provider_message_id ?? undefined,
        type: msg.type,
        direction: msg.direction,
        sender_name: msg.sender_name ?? undefined,
        delivery: msg.delivery_status ?? undefined,
        text: msg.text_content ?? undefined,
        createdAt: hhmm(msg.created_at),
        contact: msg.contact_payload ?? undefined,
        location: msg.location_payload ?? undefined,
        image: msg.image_payload ?? undefined,
        audio: msg.audio_payload ?? undefined,
        attachment: msg.attachment_payload ?? undefined,
        error_code: msg.error_code ?? undefined,
        error_description: msg.error_description ?? undefined,
      });
      byConversation.set(msg.conversation_id, list);
    }

    return convs.rows.map((conv) => {
      const outsideServiceWindow = Boolean(
        conv.window_expires_at && new Date(conv.window_expires_at).getTime() <= Date.now()
      );
      return {
        id: conv.id,
        contactName: conv.contact_name,
        phone: conv.phone,
        status: conv.status,
        lifecycle_status: conv.lifecycle_status,
        outside_service_window: outsideServiceWindow,
        requires_template_to_resume: outsideServiceWindow,
        tags: Array.isArray(conv.tags) ? conv.tags : [],
        messages: byConversation.get(conv.id) ?? [],
        ...(conv.closed_at ? { closed_at: conv.closed_at } : {}),
        ...(conv.closed_by ? { closed_by: conv.closed_by } : {}),
        ...(conv.last_customer_message_at
          ? { last_customer_message_at: conv.last_customer_message_at }
          : {}),
        ...(conv.window_expires_at ? { window_expires_at: conv.window_expires_at } : {}),
        ...(conv.metadata ? { metadata: conv.metadata } : {}),
        ...(conv.protocol_number ? { protocol_number: conv.protocol_number } : {}),
        ...(conv.tabulacao_id ? { tabulacao_id: conv.tabulacao_id } : {}),
        ...(conv.tabulacao_label ? { tabulacao_label: conv.tabulacao_label } : {}),
        ...(conv.closure_message_status
          ? { closure_message_status: conv.closure_message_status }
          : {}),
      };
    });
  } finally {
    client.release();
  }
}

async function recordTemplateOutboundMessage(input: {
  conversationId: string;
  tenantId: string;
  phone: string;
  templateName: string;
  templateContentSid?: string;
  templateParams?: Record<string, string>;
  botName?: string;
  metadataExtra?: Record<string, unknown>;
}): Promise<void> {
  const normalizedBotName = input.botName?.trim() || "BOT";
  const sendResult = await sendOutboundTemplateMessage({
    tenantId: input.tenantId,
    phone: input.phone,
    templateName: input.templateName,
    templateContentSid: input.templateContentSid,
    templateParams: input.templateParams,
  });

  const textContent = buildTemplateMessageText({
    botName: normalizedBotName,
    templateName: input.templateName,
    templateContentSid: input.templateContentSid,
    sendOk: sendResult.ok,
  });

  const errorDescription = sendResult.ok
    ? null
    : formatTemplateErrorDescription({
        code: sendResult.code,
        message: sendResult.message,
        details: sendResult.details,
      });

  await pool.query(
    `INSERT INTO agent_messages
     (conversation_id, tenant_id, provider_message_id, type, direction, sender_name,
      delivery_status, text_content, error_code, error_description, metadata)
     VALUES ($1, $2, $3, 'text', 'out', $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      input.conversationId,
      input.tenantId,
      sendResult.ok ? sendResult.messageId : null,
      normalizedBotName,
      sendResult.ok ? "sent" : "failed",
      textContent,
      sendResult.ok ? null : sendResult.code ?? "TEMPLATE_SEND",
      errorDescription,
      JSON.stringify({
        ...(input.metadataExtra ?? {}),
        templateName: input.templateName,
        templateContentSid: input.templateContentSid?.trim() || null,
        templateParams: input.templateParams ?? {},
        templateProvider: sendResult.ok ? sendResult.provider : null,
      }),
    ]
  );
}

export async function createAgentConversation(input: {
  tenantId: string;
  contactName: string;
  phone: string;
  queue?: string;
  templateName?: string;
  /** Twilio Content SID (HX…), quando aplicável. */
  templateContentSid?: string;
  templateParams?: Record<string, string>;
  botName?: string;
}): Promise<AgentConversation> {
  await ensureTenantSeed(input.tenantId);
  const client = await pool.connect();
  let createdId = "";
  try {
    const created = await client.query<{ id: string }>(
      `INSERT INTO agent_conversations (tenant_id, contact_name, phone, status, tags, metadata)
       VALUES ($1, $2, $3, 'em_espera', '["Novo contato"]'::jsonb, $4::jsonb)
       RETURNING id`,
      [
        input.tenantId,
        input.contactName,
        input.phone,
        JSON.stringify({
          queue: input.queue ?? null,
          templateName: input.templateName ?? null,
          templateContentSid: input.templateContentSid?.trim() || null,
          templateParams: input.templateParams ?? {},
        }),
      ]
    );
    createdId = created.rows[0].id;
    await ensureConversationProtocol({ tenantId: input.tenantId, conversationId: createdId });
  } finally {
    client.release();
  }

  if (input.templateName) {
    await recordTemplateOutboundMessage({
      conversationId: createdId,
      tenantId: input.tenantId,
      phone: input.phone,
      templateName: input.templateName,
      templateContentSid: input.templateContentSid,
      templateParams: input.templateParams,
      botName: input.botName,
      metadataExtra: { queue: input.queue ?? null },
    });
  }

  const all = await listAgentConversations(input.tenantId);
  const found = all.find((c) => c.id === createdId);
  if (!found) {
    throw new Error("Failed to create agent conversation");
  }
  return found;
}

export async function patchAgentMessageWhatsAppDelivery(input: {
  tenantId: string;
  messageId: string;
  providerMessageId: string | null;
  deliveryStatus: AgentMessageDelivery;
  errorCode?: string | null;
  errorDescription?: string | null;
}): Promise<void> {
  await ensureSchema();
  await pool.query(
    `UPDATE agent_messages
     SET provider_message_id = $1,
         delivery_status = $2,
         error_code = $3,
         error_description = $4
     WHERE id = $5 AND tenant_id = $6`,
    [
      input.providerMessageId,
      input.deliveryStatus,
      input.errorCode ?? null,
      input.errorDescription ?? null,
      input.messageId,
      input.tenantId,
    ]
  );
}

export async function recordInboundWhatsAppMessage(input: {
  tenantId: string;
  providerMessageId: string;
  fromWaId: string;
  textBody: string;
  contactName?: string;
  timestampIso: string;
}): Promise<{ duplicate: boolean; conversationId?: string }> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const digits = phoneDigitsOnly(input.fromWaId);
  const displayPhone = normalizeWaIdToPhone(input.fromWaId);
  const client = await pool.connect();
  try {
    let convId: string;
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM agent_conversations
       WHERE tenant_id = $1
         AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [input.tenantId, digits]
    );
    if (existing.rows.length > 0) {
      convId = existing.rows[0].id;
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO agent_conversations (tenant_id, contact_name, phone, status, tags, lifecycle_status)
         VALUES ($1, $2, $3, 'em_espera', '[]'::jsonb, 'open')
         RETURNING id`,
        [input.tenantId, input.contactName?.trim() || displayPhone, displayPhone]
      );
      convId = created.rows[0].id;
    }

    try {
      await client.query(
        `INSERT INTO agent_messages
         (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, created_at)
         VALUES ($1, $2, $3, 'text', 'in', 'read', $4, $5::timestamptz)`,
        [convId, input.tenantId, input.providerMessageId, input.textBody, input.timestampIso]
      );
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        return { duplicate: true };
      }
      throw e;
    }

    await client.query(
      `UPDATE agent_conversations
       SET last_customer_message_at = $1::timestamptz,
           window_expires_at = ($1::timestamptz + interval '24 hours'),
           lifecycle_status = 'open',
           status = CASE WHEN status = 'historico' THEN 'em_espera' ELSE status END,
           contact_name = COALESCE($3, contact_name),
           updated_at = now()
       WHERE id = $2 AND tenant_id = $4`,
      [input.timestampIso, convId, input.contactName?.trim() || null, input.tenantId]
    );

    await ensureConversationProtocol({ tenantId: input.tenantId, conversationId: convId });
    return { duplicate: false, conversationId: convId };
  } finally {
    client.release();
  }
}

function conversationQueueKey(metadata: { queue?: string } | null | undefined): string | null {
  const q = metadata?.queue;
  return typeof q === "string" && q.trim() ? q.trim() : null;
}

async function sendClosureWhatsAppText(input: {
  tenantId: string;
  conversationId: string;
  phone: string;
  textBody: string;
}): Promise<{
  ok: boolean;
  messageId?: string;
  code?: string | number;
  message?: string;
}> {
  const waCtx = await getOutboundWhatsAppContext(input.tenantId);
  if (!waCtx) {
    await pool.query(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, sender_name, delivery_status, text_content, metadata)
       VALUES ($1, $2, $3, 'text', 'out', 'Sistema', 'sent', $4, $5::jsonb)`,
      [
        input.conversationId,
        input.tenantId,
        `closure-mock-${Date.now()}`,
        input.textBody,
        JSON.stringify({ closure: true }),
      ]
    );
    return { ok: true, messageId: `closure-mock-${Date.now()}` };
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO agent_messages
     (conversation_id, tenant_id, provider_message_id, type, direction, sender_name, delivery_status, text_content, metadata)
     VALUES ($1, $2, NULL, 'text', 'out', 'Sistema', 'sending', $3, $4::jsonb)
     RETURNING id`,
    [
      input.conversationId,
      input.tenantId,
      input.textBody,
      JSON.stringify({ closure: true, automated: true }),
    ]
  );
  const messageId = inserted.rows[0]?.id;
  const digits = phoneDigitsOnly(input.phone);

  const sendResult =
    waCtx.provider === WHATSAPP_PROVIDER_TWILIO
      ? await sendTwilioWhatsAppTextMessage({
          accountSid: waCtx.accountSid,
          authToken: waCtx.authToken,
          fromE164: waCtx.fromE164,
          toDigits: digits,
          textBody: input.textBody,
        })
      : waCtx.provider === WHATSAPP_PROVIDER_CLOUD
        ? await sendWhatsAppTextMessage({
            phoneNumberId: waCtx.phoneNumberId,
            accessToken: waCtx.accessToken,
            toDigits: digits,
            textBody: input.textBody,
          })
        : { ok: false as const, message: "Provedor WhatsApp desconhecido" };

  if (messageId) {
    if (sendResult.ok) {
      await patchAgentMessageWhatsAppDelivery({
        tenantId: input.tenantId,
        messageId,
        providerMessageId: sendResult.messageId,
        deliveryStatus: "sent",
      });
    } else {
      await patchAgentMessageWhatsAppDelivery({
        tenantId: input.tenantId,
        messageId,
        providerMessageId: null,
        deliveryStatus: "failed",
        errorCode: sendResult.code != null ? String(sendResult.code) : "CLOSURE_SEND",
        errorDescription: sendResult.message,
      });
    }
  }
  return sendResult;
}

/** Mensagem de encerramento do tenant (humano ou fluxo). */
export async function sendTenantClosureMessage(input: {
  tenantId: string;
  conversationId: string;
  contactName?: string;
  tabulacaoLabel?: string;
}): Promise<"sent" | "failed" | "skipped_window_closed"> {
  const conv = await pool.query<{
    phone: string;
    contact_name: string;
    window_expires_at: string | null;
    lifecycle_status: string;
  }>(
    `SELECT phone, contact_name, window_expires_at, lifecycle_status
     FROM agent_conversations WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [input.conversationId, input.tenantId]
  );
  if (!conv.rows[0]) return "skipped_window_closed";

  const outsideWindow = Boolean(
    conv.rows[0].window_expires_at &&
      new Date(conv.rows[0].window_expires_at).getTime() <= Date.now()
  );
  if (outsideWindow) return "skipped_window_closed";

  const protocol = await ensureConversationProtocol({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
  });
  const settings = await getTenantServiceSettings(input.tenantId);
  const text = renderClosureMessageTemplate(settings.closureMessageTemplate, {
    protocolo: protocol,
    nome_cliente: input.contactName ?? conv.rows[0].contact_name,
    resumo_tabulacao: input.tabulacaoLabel,
  });

  const result = await sendClosureWhatsAppText({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    phone: conv.rows[0].phone,
    textBody: text,
  });
  return result.ok ? "sent" : "failed";
}

async function findOrCreateConversationForInbound(input: {
  tenantId: string;
  fromWaId: string;
  contactName?: string;
}): Promise<string> {
  const digits = phoneDigitsOnly(input.fromWaId);
  const displayPhone = normalizeWaIdToPhone(input.fromWaId);
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM agent_conversations
     WHERE tenant_id = $1
       AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = $2
     ORDER BY updated_at DESC
     LIMIT 1`,
    [input.tenantId, digits]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;
  const created = await pool.query<{ id: string }>(
    `INSERT INTO agent_conversations (tenant_id, contact_name, phone, status, tags, lifecycle_status)
     VALUES ($1, $2, $3, 'em_espera', '[]'::jsonb, 'open')
     RETURNING id`,
    [input.tenantId, input.contactName?.trim() || displayPhone, displayPhone]
  );
  return created.rows[0].id;
}

function buildAgentPublicMediaUrl(publicPath: string): string {
  const base = process.env.PUBLIC_API_BASE_URL?.trim();
  return base ? `${base.replace(/\/$/, "")}${publicPath}` : publicPath;
}

async function storeAgentMediaBuffer(input: {
  tenantId: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<{ url: string; fileName: string; mimeType: string; fileSizeKb: number }> {
  const ext = mimeToExtension(input.mimeType, input.fileName);
  const saved = await saveAgentMediaFile({
    tenantId: input.tenantId,
    buffer: input.buffer,
    mimeType: input.mimeType,
    extension: ext,
  });
  return {
    url: buildAgentPublicMediaUrl(saved.publicPath),
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSizeKb: Math.max(1, Math.round(input.buffer.length / 1024)),
  };
}

function twilioMediaPublicUrl(publicUrl: string): string {
  return publicUrl.startsWith("http")
    ? publicUrl
    : `https://api.clienton.com.br${publicUrl}`;
}

async function touchConversationAfterInbound(
  convId: string,
  tenantId: string,
  timestampIso: string,
  contactName?: string | null
) {
  await pool.query(
    `UPDATE agent_conversations
     SET last_customer_message_at = $1::timestamptz,
         window_expires_at = ($1::timestamptz + interval '24 hours'),
         lifecycle_status = 'open',
         status = CASE WHEN status = 'historico' THEN 'em_espera' ELSE status END,
         contact_name = COALESCE($3, contact_name),
         updated_at = now()
     WHERE id = $2 AND tenant_id = $4`,
    [timestampIso, convId, contactName?.trim() || null, tenantId]
  );
  await ensureConversationProtocol({ tenantId, conversationId: convId });
}

export async function recordInboundWhatsAppImage(input: {
  tenantId: string;
  providerMessageId: string;
  fromWaId: string;
  mediaId: string;
  mimeType?: string;
  caption?: string;
  contactName?: string;
  timestampIso: string;
  phoneNumberId?: string;
}): Promise<{ duplicate: boolean; conversationId?: string }> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const waCtx = await getOutboundWhatsAppContext(input.tenantId);
  if (!waCtx || waCtx.provider !== WHATSAPP_PROVIDER_CLOUD) {
    return recordInboundWhatsAppMessage({
      tenantId: input.tenantId,
      providerMessageId: input.providerMessageId,
      fromWaId: input.fromWaId,
      textBody: input.caption?.trim() || "[Imagem recebida — canal indisponível para download]",
      contactName: input.contactName,
      timestampIso: input.timestampIso,
    });
  }

  const convId = await findOrCreateConversationForInbound({
    tenantId: input.tenantId,
    fromWaId: input.fromWaId,
    contactName: input.contactName,
  });

  const mediaUrlResult = await getWhatsAppMediaUrl({
    mediaId: input.mediaId,
    accessToken: waCtx.accessToken,
    phoneNumberId: input.phoneNumberId ?? waCtx.phoneNumberId,
  });

  let imagePayload: AgentImagePayload = {
    url: "",
    fileName: "imagem-recebida.jpg",
    mimeType: input.mimeType ?? "image/jpeg",
    caption: input.caption,
    mediaId: input.mediaId,
  };
  let textContent = input.caption?.trim() || "Imagem recebida";

  if (mediaUrlResult.ok) {
    try {
      const buffer = await downloadWhatsAppMediaBuffer(mediaUrlResult.url, waCtx.accessToken);
      const ext = mimeToExtension(mediaUrlResult.mimeType ?? input.mimeType ?? "image/jpeg");
      const saved = await saveAgentMediaFile({
        tenantId: input.tenantId,
        buffer,
        mimeType: mediaUrlResult.mimeType ?? input.mimeType ?? "image/jpeg",
        extension: ext,
      });
      const publicUrl = process.env.PUBLIC_API_BASE_URL?.trim()
        ? `${process.env.PUBLIC_API_BASE_URL.replace(/\/$/, "")}${saved.publicPath}`
        : saved.publicPath;
      imagePayload = {
        url: publicUrl,
        fileName: `imagem.${ext}`,
        mimeType: mediaUrlResult.mimeType ?? input.mimeType,
        fileSizeKb: Math.max(1, Math.round(buffer.length / 1024)),
        caption: input.caption,
        mediaId: input.mediaId,
      };
    } catch {
      imagePayload.url = mediaUrlResult.url;
    }
  } else {
    textContent = `${textContent} (${mediaUrlResult.message})`.trim();
  }

  try {
    await pool.query(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, image_payload, created_at)
       VALUES ($1, $2, $3, 'image', 'in', 'read', $4, $5::jsonb, $6::timestamptz)`,
      [
        convId,
        input.tenantId,
        input.providerMessageId,
        textContent,
        JSON.stringify(imagePayload),
        input.timestampIso,
      ]
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") return { duplicate: true };
    throw e;
  }

  await touchConversationAfterInbound(
    convId,
    input.tenantId,
    input.timestampIso,
    input.contactName
  );
  return { duplicate: false, conversationId: convId };
}

export async function recordInboundTwilioImage(input: {
  tenantId: string;
  providerMessageId: string;
  fromWaId: string;
  mediaUrl: string;
  mimeType?: string;
  caption?: string;
  contactName?: string;
  timestampIso: string;
  accountSid: string;
  authToken: string;
}): Promise<{ duplicate: boolean; conversationId?: string }> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const convId = await findOrCreateConversationForInbound({
    tenantId: input.tenantId,
    fromWaId: input.fromWaId,
    contactName: input.contactName,
  });

  let imagePayload: AgentImagePayload = {
    url: input.mediaUrl,
    fileName: "imagem-recebida.jpg",
    mimeType: input.mimeType ?? "image/jpeg",
    caption: input.caption,
  };
  const textContent = input.caption?.trim() || "Imagem recebida";

  try {
    const buffer = await downloadTwilioMediaBuffer({
      accountSid: input.accountSid,
      authToken: input.authToken,
      mediaUrl: input.mediaUrl,
    });
    const ext = mimeToExtension(input.mimeType ?? "image/jpeg");
    const saved = await saveAgentMediaFile({
      tenantId: input.tenantId,
      buffer,
      mimeType: input.mimeType ?? "image/jpeg",
      extension: ext,
    });
    const publicUrl = process.env.PUBLIC_API_BASE_URL?.trim()
      ? `${process.env.PUBLIC_API_BASE_URL.replace(/\/$/, "")}${saved.publicPath}`
      : saved.publicPath;
    imagePayload = {
      url: publicUrl,
      fileName: `imagem.${ext}`,
      mimeType: input.mimeType,
      fileSizeKb: Math.max(1, Math.round(buffer.length / 1024)),
      caption: input.caption,
    };
  } catch {
    /* mantém URL Twilio original */
  }

  try {
    await pool.query(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, image_payload, created_at)
       VALUES ($1, $2, $3, 'image', 'in', 'read', $4, $5::jsonb, $6::timestamptz)`,
      [
        convId,
        input.tenantId,
        input.providerMessageId,
        textContent,
        JSON.stringify(imagePayload),
        input.timestampIso,
      ]
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") return { duplicate: true };
    throw e;
  }

  await touchConversationAfterInbound(
    convId,
    input.tenantId,
    input.timestampIso,
    input.contactName
  );
  return { duplicate: false, conversationId: convId };
}

export async function appendAgentImageMessage(
  tenantId: string,
  conversationId: string,
  input: {
    imageBase64: string;
    mimeType: string;
    fileName?: string;
    caption?: string;
    senderName?: string;
    publicApiBaseUrl?: string;
  }
): Promise<AgentConversation | null> {
  await ensureTenantSeed(tenantId);
  await syncWindowClosure(tenantId);
  const waCtx = await getOutboundWhatsAppContext(tenantId);
  const normalizedSender = input.senderName?.trim() || null;
  const caption = input.caption?.trim();
  const fileName = input.fileName?.trim() || "imagem.jpg";
  const mimeType = input.mimeType?.trim() || "image/jpeg";

  const buffer = Buffer.from(input.imageBase64, "base64");
  if (buffer.length === 0) {
    throw new Error("IMAGEM_INVALIDA");
  }

  let customerPhone = "";
  const client = await pool.connect();
  let outboundMessageId: string | null = null;
  try {
    const exists = await client.query<{
      id: string;
      phone: string;
      lifecycle_status: AgentConversationLifecycleStatus;
      window_expires_at: string | null;
    }>(
      `SELECT id, phone, lifecycle_status, window_expires_at
       FROM agent_conversations
       WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
    if (exists.rows.length === 0) return null;
    customerPhone = exists.rows[0].phone;
    const conversation = exists.rows[0];
    const outsideWindow = Boolean(
      conversation.window_expires_at &&
        new Date(conversation.window_expires_at).getTime() <= Date.now()
    );
    if (conversation.lifecycle_status !== "open") {
      throw new AgentConversationRuleError(
        "CONVERSATION_CLOSED",
        "Conversa encerrada. Reabra o atendimento para enviar mensagens."
      );
    }
    if (outsideWindow) {
      throw new AgentConversationRuleError(
        "WINDOW_CLOSED_TEMPLATE_REQUIRED",
        "Janela da Meta encerrada. Envie template para retomar o atendimento."
      );
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, sender_name, delivery_status, text_content)
       VALUES ($1, $2, NULL, 'image', 'out', $3, 'sending', $4)
       RETURNING id`,
      [
        conversationId,
        tenantId,
        normalizedSender,
        caption ? `${normalizedSender ?? ""}:\n${caption}` : `Imagem: ${fileName}`,
      ]
    );
    outboundMessageId = inserted.rows[0].id;
    await client.query(
      `UPDATE agent_conversations SET status = 'em_andamento', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
  } finally {
    client.release();
  }

  if (!waCtx || !outboundMessageId) {
    return listAgentConversations(tenantId).then(
      (all) => all.find((c) => c.id === conversationId) ?? null
    );
  }

  const ext = mimeToExtension(mimeType);
  const saved = await saveAgentMediaFile({ tenantId, buffer, mimeType, extension: ext });
  const publicUrl = input.publicApiBaseUrl
    ? `${input.publicApiBaseUrl.replace(/\/$/, "")}${saved.publicPath}`
    : saved.publicPath;

  const imagePayload: AgentImagePayload = {
    url: publicUrl,
    fileName,
    mimeType,
    fileSizeKb: Math.max(1, Math.round(buffer.length / 1024)),
    caption,
  };

  let sendResult:
    | { ok: true; messageId: string }
    | { ok: false; message: string; code?: number | string; details?: string };

  if (waCtx.provider === WHATSAPP_PROVIDER_CLOUD) {
    const upload = await uploadWhatsAppMedia({
      phoneNumberId: waCtx.phoneNumberId,
      accessToken: waCtx.accessToken,
      buffer,
      mimeType,
      fileName,
    });
    if (!upload.ok) {
      sendResult = upload;
    } else {
      sendResult = await sendWhatsAppImageMessage({
        phoneNumberId: waCtx.phoneNumberId,
        accessToken: waCtx.accessToken,
        toDigits: customerPhone,
        mediaId: upload.messageId,
        caption,
      });
    }
  } else if (waCtx.provider === WHATSAPP_PROVIDER_TWILIO) {
    sendResult = await sendTwilioWhatsAppMediaMessage({
      accountSid: waCtx.accountSid,
      authToken: waCtx.authToken,
      fromE164: waCtx.fromE164,
      toDigits: customerPhone,
      mediaUrl: publicUrl.startsWith("http") ? publicUrl : `https://api.clienton.com.br${publicUrl}`,
      caption,
    });
  } else {
    sendResult = { ok: false, message: "Provedor WhatsApp desconhecido" };
  }

  await pool.query(
    `UPDATE agent_messages
     SET image_payload = $1::jsonb,
         provider_message_id = $2,
         delivery_status = $3,
         error_code = $4,
         error_description = $5
     WHERE id = $6 AND tenant_id = $7`,
    [
      JSON.stringify(imagePayload),
      sendResult.ok ? sendResult.messageId : null,
      sendResult.ok ? "sent" : "failed",
      sendResult.ok ? null : String(sendResult.code ?? "MEDIA_SEND"),
      sendResult.ok
        ? null
        : [sendResult.message, sendResult.details].filter(Boolean).join(" — "),
      outboundMessageId,
      tenantId,
    ]
  );

  const refreshed = await listAgentConversations(tenantId);
  return refreshed.find((c) => c.id === conversationId) ?? null;
}

export async function recordInboundWhatsAppAudio(input: {
  tenantId: string;
  providerMessageId: string;
  fromWaId: string;
  mediaId: string;
  mimeType?: string;
  voice?: boolean;
  contactName?: string;
  timestampIso: string;
  phoneNumberId?: string;
}): Promise<{ duplicate: boolean; conversationId?: string }> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const waCtx = await getOutboundWhatsAppContext(input.tenantId);
  if (!waCtx || waCtx.provider !== WHATSAPP_PROVIDER_CLOUD) {
    return recordInboundWhatsAppMessage({
      tenantId: input.tenantId,
      providerMessageId: input.providerMessageId,
      fromWaId: input.fromWaId,
      textBody: "[Áudio recebido — canal indisponível para download]",
      contactName: input.contactName,
      timestampIso: input.timestampIso,
    });
  }

  const convId = await findOrCreateConversationForInbound({
    tenantId: input.tenantId,
    fromWaId: input.fromWaId,
    contactName: input.contactName,
  });

  let audioPayload: AgentAudioPayload = {
    url: "",
    fileName: "audio.ogg",
    mimeType: input.mimeType ?? "audio/ogg",
    voice: input.voice,
    mediaId: input.mediaId,
  };
  let textContent = "Áudio recebido";

  const mediaUrlResult = await getWhatsAppMediaUrl({
    mediaId: input.mediaId,
    accessToken: waCtx.accessToken,
    phoneNumberId: input.phoneNumberId ?? waCtx.phoneNumberId,
  });

  if (mediaUrlResult.ok) {
    try {
      const buffer = await downloadWhatsAppMediaBuffer(mediaUrlResult.url, waCtx.accessToken);
      const stored = await storeAgentMediaBuffer({
        tenantId: input.tenantId,
        buffer,
        mimeType: mediaUrlResult.mimeType ?? input.mimeType ?? "audio/ogg",
        fileName: `audio.${mimeToExtension(mediaUrlResult.mimeType ?? input.mimeType ?? "audio/ogg")}`,
      });
      audioPayload = { ...stored, voice: input.voice, mediaId: input.mediaId };
    } catch {
      audioPayload.url = mediaUrlResult.url;
    }
  } else {
    textContent = `${textContent} (${mediaUrlResult.message})`.trim();
  }

  try {
    await pool.query(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, audio_payload, created_at)
       VALUES ($1, $2, $3, 'audio', 'in', 'read', $4, $5::jsonb, $6::timestamptz)`,
      [
        convId,
        input.tenantId,
        input.providerMessageId,
        textContent,
        JSON.stringify(audioPayload),
        input.timestampIso,
      ]
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") return { duplicate: true };
    throw e;
  }

  await touchConversationAfterInbound(convId, input.tenantId, input.timestampIso, input.contactName);
  return { duplicate: false, conversationId: convId };
}

export async function recordInboundWhatsAppDocument(input: {
  tenantId: string;
  providerMessageId: string;
  fromWaId: string;
  mediaId: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  contactName?: string;
  timestampIso: string;
  phoneNumberId?: string;
}): Promise<{ duplicate: boolean; conversationId?: string }> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const waCtx = await getOutboundWhatsAppContext(input.tenantId);
  const fallbackName = input.fileName?.trim() || "arquivo";
  if (!waCtx || waCtx.provider !== WHATSAPP_PROVIDER_CLOUD) {
    return recordInboundWhatsAppMessage({
      tenantId: input.tenantId,
      providerMessageId: input.providerMessageId,
      fromWaId: input.fromWaId,
      textBody: input.caption?.trim() || `[Arquivo recebido: ${fallbackName}]`,
      contactName: input.contactName,
      timestampIso: input.timestampIso,
    });
  }

  const convId = await findOrCreateConversationForInbound({
    tenantId: input.tenantId,
    fromWaId: input.fromWaId,
    contactName: input.contactName,
  });

  let attachmentPayload: AgentAttachmentPayload = {
    url: "",
    fileName: fallbackName,
    mimeType: input.mimeType,
    caption: input.caption,
    mediaId: input.mediaId,
  };
  let textContent = input.caption?.trim() || `Arquivo: ${fallbackName}`;

  const mediaUrlResult = await getWhatsAppMediaUrl({
    mediaId: input.mediaId,
    accessToken: waCtx.accessToken,
    phoneNumberId: input.phoneNumberId ?? waCtx.phoneNumberId,
  });

  if (mediaUrlResult.ok) {
    try {
      const buffer = await downloadWhatsAppMediaBuffer(mediaUrlResult.url, waCtx.accessToken);
      const stored = await storeAgentMediaBuffer({
        tenantId: input.tenantId,
        buffer,
        mimeType: mediaUrlResult.mimeType ?? input.mimeType ?? "application/octet-stream",
        fileName: fallbackName,
      });
      attachmentPayload = { ...stored, caption: input.caption, mediaId: input.mediaId };
    } catch {
      attachmentPayload.url = mediaUrlResult.url;
    }
  } else {
    textContent = `${textContent} (${mediaUrlResult.message})`.trim();
  }

  try {
    await pool.query(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, attachment_payload, created_at)
       VALUES ($1, $2, $3, 'attachment', 'in', 'read', $4, $5::jsonb, $6::timestamptz)`,
      [
        convId,
        input.tenantId,
        input.providerMessageId,
        textContent,
        JSON.stringify(attachmentPayload),
        input.timestampIso,
      ]
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") return { duplicate: true };
    throw e;
  }

  await touchConversationAfterInbound(convId, input.tenantId, input.timestampIso, input.contactName);
  return { duplicate: false, conversationId: convId };
}

export async function recordInboundTwilioAudio(input: {
  tenantId: string;
  providerMessageId: string;
  fromWaId: string;
  mediaUrl: string;
  mimeType?: string;
  contactName?: string;
  timestampIso: string;
  accountSid: string;
  authToken: string;
}): Promise<{ duplicate: boolean; conversationId?: string }> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const convId = await findOrCreateConversationForInbound({
    tenantId: input.tenantId,
    fromWaId: input.fromWaId,
    contactName: input.contactName,
  });

  let audioPayload: AgentAudioPayload = {
    url: input.mediaUrl,
    fileName: "audio.ogg",
    mimeType: input.mimeType ?? "audio/ogg",
  };
  const textContent = "Áudio recebido";

  try {
    const buffer = await downloadTwilioMediaBuffer({
      accountSid: input.accountSid,
      authToken: input.authToken,
      mediaUrl: input.mediaUrl,
    });
    const stored = await storeAgentMediaBuffer({
      tenantId: input.tenantId,
      buffer,
      mimeType: input.mimeType ?? "audio/ogg",
      fileName: `audio.${mimeToExtension(input.mimeType ?? "audio/ogg")}`,
    });
    audioPayload = stored;
  } catch {
    /* mantém URL Twilio */
  }

  try {
    await pool.query(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, audio_payload, created_at)
       VALUES ($1, $2, $3, 'audio', 'in', 'read', $4, $5::jsonb, $6::timestamptz)`,
      [convId, input.tenantId, input.providerMessageId, textContent, JSON.stringify(audioPayload), input.timestampIso]
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") return { duplicate: true };
    throw e;
  }

  await touchConversationAfterInbound(convId, input.tenantId, input.timestampIso, input.contactName);
  return { duplicate: false, conversationId: convId };
}

export async function recordInboundTwilioAttachment(input: {
  tenantId: string;
  providerMessageId: string;
  fromWaId: string;
  mediaUrl: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
  contactName?: string;
  timestampIso: string;
  accountSid: string;
  authToken: string;
}): Promise<{ duplicate: boolean; conversationId?: string }> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const convId = await findOrCreateConversationForInbound({
    tenantId: input.tenantId,
    fromWaId: input.fromWaId,
    contactName: input.contactName,
  });

  const fallbackName = input.fileName?.trim() || "arquivo";
  let attachmentPayload: AgentAttachmentPayload = {
    url: input.mediaUrl,
    fileName: fallbackName,
    mimeType: input.mimeType,
    caption: input.caption,
  };
  const textContent = input.caption?.trim() || `Arquivo: ${fallbackName}`;

  try {
    const buffer = await downloadTwilioMediaBuffer({
      accountSid: input.accountSid,
      authToken: input.authToken,
      mediaUrl: input.mediaUrl,
    });
    const stored = await storeAgentMediaBuffer({
      tenantId: input.tenantId,
      buffer,
      mimeType: input.mimeType ?? "application/octet-stream",
      fileName: fallbackName,
    });
    attachmentPayload = { ...stored, caption: input.caption };
  } catch {
    /* mantém URL Twilio */
  }

  try {
    await pool.query(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, attachment_payload, created_at)
       VALUES ($1, $2, $3, 'attachment', 'in', 'read', $4, $5::jsonb, $6::timestamptz)`,
      [convId, input.tenantId, input.providerMessageId, textContent, JSON.stringify(attachmentPayload), input.timestampIso]
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") return { duplicate: true };
    throw e;
  }

  await touchConversationAfterInbound(convId, input.tenantId, input.timestampIso, input.contactName);
  return { duplicate: false, conversationId: convId };
}

export async function appendAgentAudioMessage(
  tenantId: string,
  conversationId: string,
  input: {
    audioBase64: string;
    mimeType?: string;
    durationSec?: number;
    senderName?: string;
    publicApiBaseUrl?: string;
  }
): Promise<AgentConversation | null> {
  await ensureTenantSeed(tenantId);
  await syncWindowClosure(tenantId);
  const waCtx = await getOutboundWhatsAppContext(tenantId);
  const normalizedSender = input.senderName?.trim() || null;

  const rawBuffer = Buffer.from(input.audioBase64, "base64");
  if (rawBuffer.length === 0) throw new Error("AUDIO_INVALIDO");

  const prepared = prepareOutboundAgentAudio(rawBuffer);
  const sendBuffer = prepared.buffer;
  const mimeType = prepared.mimeType;
  const fileName = prepared.fileName;
  const asDocument = mimeType === "audio/webm";

  let customerPhone = "";
  const client = await pool.connect();
  let outboundMessageId: string | null = null;
  try {
    const exists = await client.query<{
      id: string;
      phone: string;
      lifecycle_status: AgentConversationLifecycleStatus;
      window_expires_at: string | null;
    }>(
      `SELECT id, phone, lifecycle_status, window_expires_at
       FROM agent_conversations
       WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
    if (exists.rows.length === 0) return null;
    customerPhone = exists.rows[0].phone;
    const conversation = exists.rows[0];
    const outsideWindow = Boolean(
      conversation.window_expires_at &&
        new Date(conversation.window_expires_at).getTime() <= Date.now()
    );
    if (conversation.lifecycle_status !== "open") {
      throw new AgentConversationRuleError(
        "CONVERSATION_CLOSED",
        "Conversa encerrada. Reabra o atendimento para enviar mensagens."
      );
    }
    if (outsideWindow) {
      throw new AgentConversationRuleError(
        "WINDOW_CLOSED_TEMPLATE_REQUIRED",
        "Janela da Meta encerrada. Envie template para retomar o atendimento."
      );
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, sender_name, delivery_status, text_content)
       VALUES ($1, $2, NULL, 'audio', 'out', $3, 'sending', $4)
       RETURNING id`,
      [conversationId, tenantId, normalizedSender, "Áudio enviado"]
    );
    outboundMessageId = inserted.rows[0].id;
    await client.query(
      `UPDATE agent_conversations SET status = 'em_andamento', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
  } finally {
    client.release();
  }

  const stored = await storeAgentMediaBuffer({
    tenantId,
    buffer: sendBuffer,
    mimeType,
    fileName,
  });
  const audioPayload: AgentAudioPayload = {
    ...stored,
    durationSec: input.durationSec,
    voice: prepared.voice && !asDocument,
  };

  if (!waCtx || !outboundMessageId) {
    await pool.query(
      `UPDATE agent_messages SET audio_payload = $1::jsonb, delivery_status = 'sent' WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(audioPayload), outboundMessageId, tenantId]
    );
    const refreshed = await listAgentConversations(tenantId);
    return refreshed.find((c) => c.id === conversationId) ?? null;
  }

  let sendResult:
    | { ok: true; messageId: string }
    | { ok: false; message: string; code?: number | string; details?: string };

  if (waCtx.provider === WHATSAPP_PROVIDER_CLOUD) {
    const upload = await uploadWhatsAppMedia({
      phoneNumberId: waCtx.phoneNumberId,
      accessToken: waCtx.accessToken,
      buffer: sendBuffer,
      mimeType,
      fileName,
    });
    if (!upload.ok) {
      sendResult = upload;
    } else if (asDocument) {
      sendResult = await sendWhatsAppDocumentMessage({
        phoneNumberId: waCtx.phoneNumberId,
        accessToken: waCtx.accessToken,
        toDigits: customerPhone,
        mediaId: upload.messageId,
        fileName,
      });
    } else {
      sendResult = await sendWhatsAppAudioMessage({
        phoneNumberId: waCtx.phoneNumberId,
        accessToken: waCtx.accessToken,
        toDigits: customerPhone,
        mediaId: upload.messageId,
        voice: prepared.voice,
      });
    }
  } else if (waCtx.provider === WHATSAPP_PROVIDER_TWILIO) {
    sendResult = await sendTwilioWhatsAppMediaMessage({
      accountSid: waCtx.accountSid,
      authToken: waCtx.authToken,
      fromE164: waCtx.fromE164,
      toDigits: customerPhone,
      mediaUrl: twilioMediaPublicUrl(stored.url),
    });
  } else {
    sendResult = { ok: false, message: "Provedor WhatsApp desconhecido" };
  }

  await pool.query(
    `UPDATE agent_messages
     SET audio_payload = $1::jsonb,
         provider_message_id = $2,
         delivery_status = $3,
         error_code = $4,
         error_description = $5
     WHERE id = $6 AND tenant_id = $7`,
    [
      JSON.stringify(audioPayload),
      sendResult.ok ? sendResult.messageId : null,
      sendResult.ok ? "sent" : "failed",
      sendResult.ok ? null : String(sendResult.code ?? "MEDIA_SEND"),
      sendResult.ok ? null : [sendResult.message, sendResult.details].filter(Boolean).join(" — "),
      outboundMessageId,
      tenantId,
    ]
  );

  const refreshed = await listAgentConversations(tenantId);
  return refreshed.find((c) => c.id === conversationId) ?? null;
}

export async function appendAgentAttachmentMessage(
  tenantId: string,
  conversationId: string,
  input: {
    fileBase64: string;
    mimeType: string;
    fileName: string;
    caption?: string;
    senderName?: string;
    publicApiBaseUrl?: string;
  }
): Promise<AgentConversation | null> {
  await ensureTenantSeed(tenantId);
  await syncWindowClosure(tenantId);
  const waCtx = await getOutboundWhatsAppContext(tenantId);
  const normalizedSender = input.senderName?.trim() || null;
  const caption = input.caption?.trim();
  const fileName = input.fileName?.trim() || "arquivo";
  const mimeType = input.mimeType?.trim() || "application/octet-stream";

  const buffer = Buffer.from(input.fileBase64, "base64");
  if (buffer.length === 0) throw new Error("ARQUIVO_INVALIDO");

  let customerPhone = "";
  const client = await pool.connect();
  let outboundMessageId: string | null = null;
  try {
    const exists = await client.query<{
      id: string;
      phone: string;
      lifecycle_status: AgentConversationLifecycleStatus;
      window_expires_at: string | null;
    }>(
      `SELECT id, phone, lifecycle_status, window_expires_at
       FROM agent_conversations
       WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
    if (exists.rows.length === 0) return null;
    customerPhone = exists.rows[0].phone;
    const conversation = exists.rows[0];
    const outsideWindow = Boolean(
      conversation.window_expires_at &&
        new Date(conversation.window_expires_at).getTime() <= Date.now()
    );
    if (conversation.lifecycle_status !== "open") {
      throw new AgentConversationRuleError(
        "CONVERSATION_CLOSED",
        "Conversa encerrada. Reabra o atendimento para enviar mensagens."
      );
    }
    if (outsideWindow) {
      throw new AgentConversationRuleError(
        "WINDOW_CLOSED_TEMPLATE_REQUIRED",
        "Janela da Meta encerrada. Envie template para retomar o atendimento."
      );
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, sender_name, delivery_status, text_content)
       VALUES ($1, $2, NULL, 'attachment', 'out', $3, 'sending', $4)
       RETURNING id`,
      [conversationId, tenantId, normalizedSender, caption ? `Anexo: ${fileName}` : `Anexo: ${fileName}`]
    );
    outboundMessageId = inserted.rows[0].id;
    await client.query(
      `UPDATE agent_conversations SET status = 'em_andamento', updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
  } finally {
    client.release();
  }

  const stored = await storeAgentMediaBuffer({ tenantId, buffer, mimeType, fileName });
  const attachmentPayload: AgentAttachmentPayload = { ...stored, caption };

  if (!waCtx || !outboundMessageId) {
    await pool.query(
      `UPDATE agent_messages SET attachment_payload = $1::jsonb, delivery_status = 'sent' WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify(attachmentPayload), outboundMessageId, tenantId]
    );
    const refreshed = await listAgentConversations(tenantId);
    return refreshed.find((c) => c.id === conversationId) ?? null;
  }

  let sendResult:
    | { ok: true; messageId: string }
    | { ok: false; message: string; code?: number | string; details?: string };

  if (waCtx.provider === WHATSAPP_PROVIDER_CLOUD) {
    const upload = await uploadWhatsAppMedia({
      phoneNumberId: waCtx.phoneNumberId,
      accessToken: waCtx.accessToken,
      buffer,
      mimeType,
      fileName,
    });
    if (!upload.ok) {
      sendResult = upload;
    } else {
      sendResult = await sendWhatsAppDocumentMessage({
        phoneNumberId: waCtx.phoneNumberId,
        accessToken: waCtx.accessToken,
        toDigits: customerPhone,
        mediaId: upload.messageId,
        fileName,
        caption,
      });
    }
  } else if (waCtx.provider === WHATSAPP_PROVIDER_TWILIO) {
    sendResult = await sendTwilioWhatsAppMediaMessage({
      accountSid: waCtx.accountSid,
      authToken: waCtx.authToken,
      fromE164: waCtx.fromE164,
      toDigits: customerPhone,
      mediaUrl: twilioMediaPublicUrl(stored.url),
      caption,
    });
  } else {
    sendResult = { ok: false, message: "Provedor WhatsApp desconhecido" };
  }

  await pool.query(
    `UPDATE agent_messages
     SET attachment_payload = $1::jsonb,
         provider_message_id = $2,
         delivery_status = $3,
         error_code = $4,
         error_description = $5
     WHERE id = $6 AND tenant_id = $7`,
    [
      JSON.stringify(attachmentPayload),
      sendResult.ok ? sendResult.messageId : null,
      sendResult.ok ? "sent" : "failed",
      sendResult.ok ? null : String(sendResult.code ?? "MEDIA_SEND"),
      sendResult.ok ? null : [sendResult.message, sendResult.details].filter(Boolean).join(" — "),
      outboundMessageId,
      tenantId,
    ]
  );

  const refreshed = await listAgentConversations(tenantId);
  return refreshed.find((c) => c.id === conversationId) ?? null;
}

export async function recordInboundWhatsAppLocation(input: {
  tenantId: string;
  providerMessageId: string;
  fromWaId: string;
  latitude: number;
  longitude: number;
  label?: string;
  address?: string;
  contactName?: string;
  timestampIso: string;
}): Promise<{ duplicate: boolean; conversationId?: string }> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const convId = await findOrCreateConversationForInbound({
    tenantId: input.tenantId,
    fromWaId: input.fromWaId,
    contactName: input.contactName,
  });
  const locationPayload = {
    label: input.label?.trim() || input.address?.trim() || "Localização",
    lat: input.latitude,
    lng: input.longitude,
  };
  const textContent = `${locationPayload.label} (${input.latitude}, ${input.longitude})`;

  try {
    await pool.query(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, location_payload, created_at)
       VALUES ($1, $2, $3, 'location', 'in', 'read', $4, $5::jsonb, $6::timestamptz)`,
      [
        convId,
        input.tenantId,
        input.providerMessageId,
        textContent,
        JSON.stringify(locationPayload),
        input.timestampIso,
      ]
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") return { duplicate: true };
    throw e;
  }

  await touchConversationAfterInbound(convId, input.tenantId, input.timestampIso, input.contactName);
  return { duplicate: false, conversationId: convId };
}

/** Twilio envia Latitude/Longitude no POST (Body costuma vir vazio). */
export async function recordInboundTwilioLocation(
  input: Parameters<typeof recordInboundWhatsAppLocation>[0]
): Promise<{ duplicate: boolean; conversationId?: string }> {
  return recordInboundWhatsAppLocation(input);
}

export async function recordInboundWhatsAppContacts(input: {
  tenantId: string;
  providerMessageId: string;
  fromWaId: string;
  contacts: Array<{ name: string; phone: string }>;
  contactName?: string;
  timestampIso: string;
}): Promise<{ duplicate: boolean; conversationId?: string }> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const convId = await findOrCreateConversationForInbound({
    tenantId: input.tenantId,
    fromWaId: input.fromWaId,
    contactName: input.contactName,
  });
  const primary = input.contacts[0];
  const contactPayload = { name: primary.name, phone: primary.phone };
  const textContent =
    input.contacts.length > 1
      ? `Contatos compartilhados: ${input.contacts.map((c) => c.name).join(", ")}`
      : `Contato: ${primary.name} — ${primary.phone}`;

  try {
    await pool.query(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, contact_payload, created_at)
       VALUES ($1, $2, $3, 'contact', 'in', 'read', $4, $5::jsonb, $6::timestamptz)`,
      [
        convId,
        input.tenantId,
        input.providerMessageId,
        textContent,
        JSON.stringify(contactPayload),
        input.timestampIso,
      ]
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") return { duplicate: true };
    throw e;
  }

  await touchConversationAfterInbound(convId, input.tenantId, input.timestampIso, input.contactName);
  return { duplicate: false, conversationId: convId };
}

export async function recordInboundTwilioContact(input: {
  tenantId: string;
  providerMessageId: string;
  fromWaId: string;
  mediaUrl: string;
  mimeType?: string;
  contactName?: string;
  timestampIso: string;
  accountSid: string;
  authToken: string;
}): Promise<{ duplicate: boolean; conversationId?: string }> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const convId = await findOrCreateConversationForInbound({
    tenantId: input.tenantId,
    fromWaId: input.fromWaId,
    contactName: input.contactName,
  });

  let contactPayload = { name: "Contato", phone: "" };
  try {
    const buffer = await downloadTwilioMediaBuffer({
      accountSid: input.accountSid,
      authToken: input.authToken,
      mediaUrl: input.mediaUrl,
    });
    const parsed = parseVcardContact(buffer);
    if (parsed) contactPayload = parsed;
  } catch {
    /* ignore */
  }

  if (!contactPayload.phone) {
    return recordInboundTwilioAttachment({
      tenantId: input.tenantId,
      providerMessageId: input.providerMessageId,
      fromWaId: input.fromWaId,
      mediaUrl: input.mediaUrl,
      mimeType: input.mimeType,
      fileName: "contato.vcf",
      contactName: input.contactName,
      timestampIso: input.timestampIso,
      accountSid: input.accountSid,
      authToken: input.authToken,
    });
  }

  try {
    await pool.query(
      `INSERT INTO agent_messages
       (conversation_id, tenant_id, provider_message_id, type, direction, delivery_status, text_content, contact_payload, created_at)
       VALUES ($1, $2, $3, 'contact', 'in', 'read', $4, $5::jsonb, $6::timestamptz)`,
      [
        convId,
        input.tenantId,
        input.providerMessageId,
        `Contato: ${contactPayload.name} — ${contactPayload.phone}`,
        JSON.stringify(contactPayload),
        input.timestampIso,
      ]
    );
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") return { duplicate: true };
    throw e;
  }

  await touchConversationAfterInbound(convId, input.tenantId, input.timestampIso, input.contactName);
  return { duplicate: false, conversationId: convId };
}

function buildTwilioContactFallbackText(contact: { name: string; phone: string }): string {
  return `Contato: ${contact.name}\nTelefone: ${contact.phone}`;
}

function buildTwilioLocationFallbackText(location: {
  label: string;
  lat: number;
  lng: number;
}): string {
  const maps = `https://maps.google.com/?q=${location.lat},${location.lng}`;
  return `Localização: ${location.label}\n${maps}`;
}

export async function appendAgentMessage(
  tenantId: string,
  conversationId: string,
  payload: {
    type: AgentMessageType;
    text?: string;
    contact?: { name: string; phone: string };
    location?: { label: string; lat: number; lng: number };
    senderName?: string;
  }
): Promise<AgentConversation | null> {
  await ensureTenantSeed(tenantId);
  await syncWindowClosure(tenantId);
  const waCtx = await getOutboundWhatsAppContext(tenantId);
  const normalizedSender = payload.senderName?.trim() || null;
  const normalizedText =
    payload.type === "text" && payload.text
      ? normalizedSender
        ? `${normalizedSender}:\n${payload.text}`
        : payload.text
      : payload.text;

  const hasContact =
    payload.type === "contact" &&
    Boolean(payload.contact?.name?.trim()) &&
    Boolean(payload.contact?.phone?.trim());
  const hasLocation =
    payload.type === "location" &&
    payload.location &&
    Number.isFinite(payload.location.lat) &&
    Number.isFinite(payload.location.lng);
  const hasText = payload.type === "text" && Boolean((normalizedText ?? "").trim());

  const useWhatsApp = Boolean(waCtx) && (hasText || hasContact || hasLocation);

  let outboundMessageId: string | null = null;
  let customerPhone = "";

  const client = await pool.connect();
  try {
    const exists = await client.query<{
      id: string;
      phone: string;
      lifecycle_status: AgentConversationLifecycleStatus;
      window_expires_at: string | null;
    }>(
      `SELECT id, phone, lifecycle_status, window_expires_at
       FROM agent_conversations
       WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
    if (exists.rows.length === 0) return null;
    customerPhone = exists.rows[0].phone;
    const conversation = exists.rows[0];
    const outsideWindow = Boolean(
      conversation.window_expires_at &&
        new Date(conversation.window_expires_at).getTime() <= Date.now()
    );
    if (conversation.lifecycle_status !== "open") {
      throw new AgentConversationRuleError(
        "CONVERSATION_CLOSED",
        "Conversa encerrada. Reabra o atendimento para enviar mensagens."
      );
    }
    if (outsideWindow) {
      throw new AgentConversationRuleError(
        "WINDOW_CLOSED_TEMPLATE_REQUIRED",
        "Janela da Meta encerrada. Envie template para retomar o atendimento."
      );
    }

    if (useWhatsApp) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO agent_messages
         (conversation_id, tenant_id, provider_message_id, type, direction, sender_name, delivery_status, text_content, contact_payload, location_payload)
         VALUES ($1, $2, NULL, $3, 'out', $4, 'sending', $5, $6::jsonb, $7::jsonb)
         RETURNING id`,
        [
          conversationId,
          tenantId,
          payload.type,
          normalizedSender,
          normalizedText ?? null,
          payload.contact ? JSON.stringify(payload.contact) : null,
          payload.location ? JSON.stringify(payload.location) : null,
        ]
      );
      outboundMessageId = inserted.rows[0].id;
    } else {
      await client.query(
        `INSERT INTO agent_messages
         (conversation_id, tenant_id, provider_message_id, type, direction, sender_name, delivery_status, text_content, contact_payload, location_payload)
         VALUES ($1, $2, $3, $4, 'out', $5, 'sent', $6, $7::jsonb, $8::jsonb)`,
        [
          conversationId,
          tenantId,
          `mock-${Date.now()}`,
          payload.type,
          normalizedSender,
          normalizedText ?? null,
          payload.contact ? JSON.stringify(payload.contact) : null,
          payload.location ? JSON.stringify(payload.location) : null,
        ]
      );
    }

    await client.query(
      `UPDATE agent_conversations
       SET status = 'em_andamento', updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [conversationId, tenantId]
    );
  } finally {
    client.release();
  }

  if (useWhatsApp && waCtx && outboundMessageId) {
    let sendResult:
      | { ok: true; messageId: string }
      | { ok: false; message: string; code?: number | string; details?: string };

    if (hasContact && payload.contact) {
      if (waCtx.provider === WHATSAPP_PROVIDER_CLOUD) {
        sendResult = await sendWhatsAppContactMessage({
          phoneNumberId: waCtx.phoneNumberId,
          accessToken: waCtx.accessToken,
          toDigits: customerPhone,
          name: payload.contact.name,
          phone: payload.contact.phone,
        });
      } else if (waCtx.provider === WHATSAPP_PROVIDER_TWILIO) {
        sendResult = await sendTwilioWhatsAppTextMessage({
          accountSid: waCtx.accountSid,
          authToken: waCtx.authToken,
          fromE164: waCtx.fromE164,
          toDigits: customerPhone,
          textBody: buildTwilioContactFallbackText(payload.contact),
        });
      } else {
        sendResult = { ok: false, message: "Provedor WhatsApp desconhecido" };
      }
    } else if (hasLocation && payload.location) {
      if (waCtx.provider === WHATSAPP_PROVIDER_CLOUD) {
        sendResult = await sendWhatsAppLocationMessage({
          phoneNumberId: waCtx.phoneNumberId,
          accessToken: waCtx.accessToken,
          toDigits: customerPhone,
          latitude: payload.location.lat,
          longitude: payload.location.lng,
          name: payload.location.label,
          address: payload.location.label,
        });
      } else if (waCtx.provider === WHATSAPP_PROVIDER_TWILIO) {
        sendResult = await sendTwilioWhatsAppTextMessage({
          accountSid: waCtx.accountSid,
          authToken: waCtx.authToken,
          fromE164: waCtx.fromE164,
          toDigits: customerPhone,
          textBody: buildTwilioLocationFallbackText(payload.location),
        });
      } else {
        sendResult = { ok: false, message: "Provedor WhatsApp desconhecido" };
      }
    } else if (hasText) {
      sendResult =
        waCtx.provider === WHATSAPP_PROVIDER_TWILIO
          ? await sendTwilioWhatsAppTextMessage({
              accountSid: waCtx.accountSid,
              authToken: waCtx.authToken,
              fromE164: waCtx.fromE164,
              toDigits: customerPhone,
              textBody: normalizedText ?? "",
            })
          : waCtx.provider === WHATSAPP_PROVIDER_CLOUD
            ? await sendWhatsAppTextMessage({
                phoneNumberId: waCtx.phoneNumberId,
                accessToken: waCtx.accessToken,
                toDigits: customerPhone,
                textBody: normalizedText ?? "",
              })
            : { ok: false, message: "Provedor WhatsApp desconhecido" };
    } else {
      sendResult = { ok: false, message: "Payload de mensagem inválido" };
    }

    if (sendResult.ok) {
      await patchAgentMessageWhatsAppDelivery({
        tenantId,
        messageId: outboundMessageId,
        providerMessageId: sendResult.messageId,
        deliveryStatus: "sent",
      });
    } else {
      await patchAgentMessageWhatsAppDelivery({
        tenantId,
        messageId: outboundMessageId,
        providerMessageId: null,
        deliveryStatus: "failed",
        errorCode: sendResult.code != null ? String(sendResult.code) : "GRAPH_API",
        errorDescription: [sendResult.message, sendResult.details].filter(Boolean).join(" — "),
      });
    }
  }

  const refreshed = await listAgentConversations(tenantId);
  return refreshed.find((c) => c.id === conversationId) ?? null;
}

export async function updateAgentMessageStatus(input: {
  tenantId: string;
  messageId: string;
  deliveryStatus: AgentMessageDelivery;
  errorCode?: string | null;
  errorDescription?: string | null;
}): Promise<AgentConversation | null> {
  await ensureSchema();
  const client = await pool.connect();
  let conversationId: string | null = null;
  try {
    const msg = await client.query<{ conversation_id: string }>(
      `SELECT conversation_id
       FROM agent_messages
       WHERE id = $1 AND tenant_id = $2`,
      [input.messageId, input.tenantId]
    );
    if (msg.rows.length === 0) return null;
    conversationId = msg.rows[0].conversation_id;

    const persistError = input.deliveryStatus === "failed";
    await client.query(
      `UPDATE agent_messages
       SET delivery_status = $1,
           error_code = $2,
           error_description = $3
       WHERE id = $4 AND tenant_id = $5`,
      [
        input.deliveryStatus,
        persistError ? input.errorCode ?? null : null,
        persistError ? input.errorDescription ?? null : null,
        input.messageId,
        input.tenantId,
      ]
    );

    await client.query(
      `UPDATE agent_conversations
       SET updated_at = now(),
           status = CASE
             WHEN $1 = 'failed' THEN status
             ELSE status
           END
       WHERE id = $2 AND tenant_id = $3`,
      [input.deliveryStatus, conversationId, input.tenantId]
    );
  } finally {
    client.release();
  }

  if (!conversationId) return null;
  const refreshed = await listAgentConversations(input.tenantId);
  return refreshed.find((c) => c.id === conversationId) ?? null;
}

export async function closeAgentConversation(input: {
  tenantId: string;
  conversationId: string;
  closedBy?: string;
  tabulacaoId: string;
}): Promise<AgentConversation | null> {
  await ensureSchema();
  if (!input.tabulacaoId?.trim()) {
    throw new AgentConversationRuleError(
      "TABULACAO_REQUIRED",
      "Selecione uma tabulação para encerrar o atendimento."
    );
  }

  const convRow = await pool.query<{
    id: string;
    contact_name: string;
    metadata: { queue?: string } | null;
  }>(
    `SELECT id, contact_name, metadata FROM agent_conversations
     WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [input.conversationId, input.tenantId]
  );
  if (!convRow.rows[0]) return null;

  const queueKey = conversationQueueKey(convRow.rows[0].metadata);
  let tabulacao;
  try {
    tabulacao = await assertTabulacaoAllowedForQueue({
      tenantId: input.tenantId,
      tabulacaoId: input.tabulacaoId.trim(),
      queueKey,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "TABULACAO_NOT_ALLOWED_FOR_QUEUE") {
      throw new AgentConversationRuleError(
        "TABULACAO_NOT_ALLOWED",
        "Tabulação não permitida para a fila deste atendimento."
      );
    }
    throw new AgentConversationRuleError(
      "TABULACAO_REQUIRED",
      "Tabulação inválida ou inativa."
    );
  }

  await ensureConversationProtocol({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
  });

  const closureStatus = await sendTenantClosureMessage({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    contactName: convRow.rows[0].contact_name,
    tabulacaoLabel: tabulacao.label,
  });

  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE agent_conversations
       SET lifecycle_status = 'closed_manual',
           status = 'historico',
           closed_at = now(),
           closed_by = $3,
           tabulacao_id = $4::uuid,
           tabulacao_label = $5,
           closure_message_status = $6,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [
        input.conversationId,
        input.tenantId,
        input.closedBy?.trim() || "agent",
        tabulacao.id,
        tabulacao.label,
        closureStatus,
      ]
    );
    if (result.rows.length === 0) return null;
  } finally {
    client.release();
  }
  const refreshed = await listAgentConversations(input.tenantId);
  return refreshed.find((c) => c.id === input.conversationId) ?? null;
}

export async function reopenAgentConversation(input: {
  tenantId: string;
  conversationId: string;
  reopenedBy?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  botName?: string;
}): Promise<AgentConversation | null> {
  await ensureSchema();
  await syncWindowClosure(input.tenantId);
  const client = await pool.connect();
  try {
    const convResult = await client.query<{
      id: string;
      phone: string;
      window_expires_at: string | null;
    }>(
      `SELECT id, phone, window_expires_at
       FROM agent_conversations
       WHERE id = $1 AND tenant_id = $2`,
      [input.conversationId, input.tenantId]
    );
    if (convResult.rows.length === 0) return null;
    const outsideWindow = Boolean(
      convResult.rows[0].window_expires_at &&
        new Date(convResult.rows[0].window_expires_at).getTime() <= Date.now()
    );
    if (outsideWindow && !input.templateName?.trim()) {
      throw new AgentConversationRuleError(
        "WINDOW_CLOSED_TEMPLATE_REQUIRED",
        "Para reabrir fora da janela, envie um template aprovado."
      );
    }
    await client.query(
      `UPDATE agent_conversations
       SET lifecycle_status = 'open',
           status = 'em_andamento',
           closed_at = NULL,
           closed_by = NULL,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [input.conversationId, input.tenantId]
    );
  } finally {
    client.release();
  }

  const templateName = input.templateName?.trim();
  if (templateName) {
    const convRow = await pool.query<{ phone: string }>(
      `SELECT phone FROM agent_conversations WHERE id = $1 AND tenant_id = $2`,
      [input.conversationId, input.tenantId]
    );
    const phone = convRow.rows[0]?.phone;
    if (phone) {
      await recordTemplateOutboundMessage({
        conversationId: input.conversationId,
        tenantId: input.tenantId,
        phone,
        templateName,
        templateParams: input.templateParams,
        botName: input.botName,
        metadataExtra: {
          reopenedBy: input.reopenedBy ?? "agent",
          reopen: true,
        },
      });
    }
  }

  const refreshed = await listAgentConversations(input.tenantId);
  return refreshed.find((c) => c.id === input.conversationId) ?? null;
}

export async function updateAgentMessageStatusByProvider(input: {
  tenantId: string;
  providerMessageId: string;
  deliveryStatus: AgentMessageDelivery;
  errorCode?: string | null;
  errorDescription?: string | null;
}): Promise<AgentConversation | null> {
  await ensureSchema();
  const client = await pool.connect();
  let messageId: string | null = null;
  try {
    const result = await client.query<{ id: string }>(
      `SELECT id
       FROM agent_messages
       WHERE provider_message_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.providerMessageId, input.tenantId]
    );
    if (result.rows.length === 0) return null;
    messageId = result.rows[0].id;
  } finally {
    client.release();
  }
  if (!messageId) return null;
  return updateAgentMessageStatus({
    tenantId: input.tenantId,
    messageId,
    deliveryStatus: input.deliveryStatus,
    errorCode: input.errorCode,
    errorDescription: input.errorDescription,
  });
}

/** Handoff disparado pelo executor de fluxo (node transferir_agente). */
export async function applyFlowAgentHandoff(input: {
  tenantId: string;
  conversationId: string;
  queue: string;
  flowId?: string;
  nodeId?: string;
}): Promise<boolean> {
  await ensureSchema();
  const meta = {
    queue: input.queue,
    flowHandoff: true,
    flowId: input.flowId ?? null,
    handoffNodeId: input.nodeId ?? null,
    handoffAt: new Date().toISOString(),
  };
  const result = await pool.query(
    `UPDATE agent_conversations
     SET status = 'em_espera',
         metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
         tags = (
           CASE
             WHEN COALESCE(tags, '[]'::jsonb) @> '["Handoff fluxo"]'::jsonb THEN tags
             ELSE COALESCE(tags, '[]'::jsonb) || '["Handoff fluxo"]'::jsonb
           END
         ),
         updated_at = now()
     WHERE id = $2 AND tenant_id = $3`,
    [JSON.stringify(meta), input.conversationId, input.tenantId]
  );
  return (result.rowCount ?? 0) > 0;
}
