import { createHash } from "node:crypto";
import {
  archiveOpenBotConversationsForPhone,
  recordBotOutboundMessage,
  recordBotPhaseInboundMessage,
  recordInboundWhatsAppMessage,
  phoneDigitsOnly,
  sendTenantClosureMessage,
  shouldRouteInboundToBot,
} from "./agent-conversations";
import { pool } from "./db";
import { ApiError, ERROR_CODES } from "./http";
import {
  clearInboundFlowSession,
  clearInboundFlowSessionForPhone,
  loadInboundFlowSession,
  saveInboundFlowSession,
} from "./inbound-flow-session";
import { executeFlow, type ExecuteFlowInput, type ExecuteFlowResult } from "./flow-executor";
import {
  deliverFlowOutboundToWhatsApp,
  type FlowWhatsAppSendContext,
} from "./flow-outbound-delivery";
import type { FlowOutboundMessage } from "./mensagem-outbound";
import { checkAndRecordBotOutbound } from "./bot-outbound-safeguard";
import { resolveInboundRoute, resolveInboundRouteByFirstMessage, resolveCtwaInboundRoute } from "./inbound-routes";
import {
  markCampaignRecipientResponded,
  resolveCampaignInboundRoute,
} from "./campaign-inbound";
import { getOutboundWhatsAppContext, WHATSAPP_PROVIDER_CLOUD, WHATSAPP_PROVIDER_TWILIO } from "./whatsapp-channels";
import { redis } from "./redis";
import { buildCtwaSourceKey, type CtwaReferral } from "./ctwa-referral";

const CLAIM_PREFIX = "inbound:flow:claim:";
const PHONE_CLAIM_PREFIX = "inbound:flow:phone-claim:";
const CLAIM_TTL_SEC = 60 * 60 * 24; // 24h
const PHONE_CLAIM_TTL_SEC = 20;
/** Limite de textos enviados por um único inbound (evita rajada por bug de fluxo). */
const MAX_OUTBOUND_PER_INBOUND = 3;

export type InboundProcessInput = {
  tenantId: string;
  sourceType: string;
  sourceKey: string;
  messageText: string;
  phone?: string;
  contactName?: string;
  email?: string;
  conversationId?: string;
  providerMessageId?: string;
  metadata?: Record<string, unknown>;
  /** Se true, grava mensagem na inbox do agente (WhatsApp). */
  mirrorToAgentInbox?: boolean;
  ctwaReferral?: CtwaReferral;
};

export type InboundProcessResult = {
  routed: boolean;
  flowId?: string;
  status?: ExecuteFlowResult["status"];
  resumed?: boolean;
  conversationId?: string;
  messages?: string[];
};

function buildContactKey(input: { phone?: string; email?: string; sessionId?: string }): string {
  if (input.phone?.trim()) return `phone:${phoneDigitsOnly(input.phone)}`;
  if (input.email?.trim()) return `email:${input.email.trim().toLowerCase()}`;
  if (input.sessionId?.trim()) return `session:${input.sessionId.trim()}`;
  return `anon:${Date.now()}`;
}

/** Evita reprocessar o mesmo webhook (retries Twilio/Meta) em paralelo. */
async function claimInboundProviderMessage(
  tenantId: string,
  providerMessageId: string | undefined
): Promise<boolean> {
  const id = providerMessageId?.trim();
  if (!id) return true;
  try {
    const key = `${CLAIM_PREFIX}${tenantId}:${id}`;
    const result = await redis.set(key, "1", "EX", CLAIM_TTL_SEC, "NX");
    return result === "OK";
  } catch {
    return true;
  }
}

/** Evita processar o mesmo texto do mesmo telefone em webhooks paralelos (Meta + Twilio). */
async function claimInboundPhoneMessage(
  tenantId: string,
  phone: string | undefined,
  messageText: string
): Promise<boolean> {
  const digits = phone?.trim() ? phoneDigitsOnly(phone) : "";
  const text = messageText.trim();
  if (!digits || !text) return true;
  try {
    const digest = createHash("sha256")
      .update(`${digits}:${text.toLowerCase()}`)
      .digest("hex")
      .slice(0, 16);
    const key = `${PHONE_CLAIM_PREFIX}${tenantId}:${digest}`;
    const result = await redis.set(key, "1", "EX", PHONE_CLAIM_TTL_SEC, "NX");
    return result === "OK";
  } catch {
    return true;
  }
}

function isInboundRestartRoute(route: {
  metadata: Record<string, unknown>;
} | null): boolean {
  if (!route) return false;
  const triggers = route.metadata?.message_triggers;
  return Array.isArray(triggers) && triggers.length > 0;
}

function buildWhatsAppSendContext(
  ctx: Awaited<ReturnType<typeof getOutboundWhatsAppContext>>
): FlowWhatsAppSendContext | null {
  if (!ctx) return null;
  if (ctx.provider === WHATSAPP_PROVIDER_CLOUD) {
    return {
      provider: "cloud",
      phoneNumberId: ctx.phoneNumberId,
      accessToken: ctx.accessToken,
    };
  }
  if (ctx.provider === WHATSAPP_PROVIDER_TWILIO) {
    return {
      provider: "twilio",
      accountSid: ctx.accountSid,
      authToken: ctx.authToken,
      fromE164: ctx.fromE164,
    };
  }
  return null;
}

function buildOutboundQueue(input: {
  outboundMessages?: FlowOutboundMessage[];
  messages?: string[];
}): FlowOutboundMessage[] {
  const queue = [...(input.outboundMessages ?? [])];
  if (queue.length) return queue;
  for (const raw of input.messages ?? []) {
    const body = raw.trim();
    if (body) queue.push({ kind: "text", body });
  }
  return queue;
}

async function finalizeDeferredConversationClosure(input: {
  tenantId: string;
  defer?: ExecuteFlowResult["deferConversationClosure"];
}): Promise<void> {
  const defer = input.defer;
  if (!defer?.conversationId) return;
  const closureStatus = await sendTenantClosureMessage({
    tenantId: input.tenantId,
    conversationId: defer.conversationId,
    tabulacaoLabel: defer.tabulacaoLabel,
  });
  await pool.query(
    `UPDATE agent_conversations
     SET closure_message_status = $1,
         updated_at = now()
     WHERE id = $2::uuid AND tenant_id = $3::uuid`,
    [closureStatus, defer.conversationId, input.tenantId]
  );
}

async function deliverOutboundIfWhatsApp(input: {
  tenantId: string;
  phone?: string;
  conversationId?: string;
  outboundMessages?: FlowOutboundMessage[];
  messages?: string[];
}): Promise<void> {
  const queue = buildOutboundQueue(input);
  if (!input.phone?.trim() || !queue.length) return;
  const waCtx = await getOutboundWhatsAppContext(input.tenantId);
  const sendCtx = buildWhatsAppSendContext(waCtx);
  if (!sendCtx) return;
  const toDigits = phoneDigitsOnly(input.phone);
  const capped = queue.slice(0, MAX_OUTBOUND_PER_INBOUND);
  if (queue.length > capped.length) {
    console.warn(
      `[inbound] outbound truncado ${queue.length} -> ${capped.length} para ${toDigits}`
    );
  }
  for (const outbound of capped) {
    const guard = await checkAndRecordBotOutbound({
      tenantId: input.tenantId,
      toPhone: toDigits,
      body: outbound.body,
    });
    if (!guard.allowed) {
      continue;
    }
    const sent = await deliverFlowOutboundToWhatsApp({
      ctx: sendCtx,
      toDigits,
      outbound,
    });
    if (sent.ok) {
      await recordBotOutboundMessage({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        phone: input.phone,
        textBody: outbound.body,
        providerMessageId: sent.messageId,
        botName: "Cleo",
      });
    }
  }
}

async function runFlow(input: {
  tenantId: string;
  flowId: string;
  sourceType: string;
  sourceKey: string;
  messageText: string;
  phone?: string;
  contactName?: string;
  email?: string;
  conversationId?: string;
  contactKey: string;
  executeInput?: ExecuteFlowInput;
  resumed?: boolean;
}): Promise<ExecuteFlowResult> {
  const sessionId = `${input.sourceType}:${input.sourceKey}:${input.contactKey}`;
  const baseVariables: Record<string, unknown> = {
    inbound_source_type: input.sourceType,
    inbound_source_key: input.sourceKey,
    inbound_message: input.messageText,
    contact_name: input.contactName ?? null,
    contact_phone: input.phone ?? null,
    contact_email: input.email ?? null,
  };

  const execInput: ExecuteFlowInput = {
    ...input.executeInput,
    phone: input.phone,
    conversationId: input.conversationId ?? input.executeInput?.conversationId,
    sessionId,
    userInput: input.messageText,
    variables: {
      ...baseVariables,
      ...(input.executeInput?.variables ?? {}),
    },
  };

  return executeFlow(input.flowId, input.tenantId, execInput);
}

const AI_INBOUND_FALLBACK_MESSAGE =
  "Desculpe, tive uma instabilidade momentânea para responder. Pode enviar sua mensagem novamente? Se preferir falar com uma pessoa, digite *humano*.";

function isAiProviderFailure(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === ERROR_CODES.ai.AI_RESPONSE_FAILED ||
      err.code === ERROR_CODES.ai.AI_RESPONSE_INVALID)
  );
}

async function runFlowWithAiFallback(input: {
  tenantId: string;
  flowId: string;
  sourceType: string;
  sourceKey: string;
  messageText: string;
  phone?: string;
  contactName?: string;
  email?: string;
  conversationId?: string;
  contactKey: string;
  executeInput?: ExecuteFlowInput;
  resumed?: boolean;
}): Promise<ExecuteFlowResult> {
  try {
    return await runFlow(input);
  } catch (err) {
    if (!isAiProviderFailure(err) || !input.phone?.trim()) {
      throw err;
    }
    const fallbackMessages = [AI_INBOUND_FALLBACK_MESSAGE];
    await deliverOutboundIfWhatsApp({
      tenantId: input.tenantId,
      phone: input.phone,
      conversationId: input.conversationId,
      outboundMessages: [{ kind: "text", body: AI_INBOUND_FALLBACK_MESSAGE }],
      messages: fallbackMessages,
    });
    console.warn(
      `[inbound] fallback enviado após falha de IA tenant=${input.tenantId} phone=${input.phone}`
    );
    return {
      flowId: input.flowId,
      status: "stopped",
      stopReason: "ai_provider_failure",
      visitedNodeIds: [],
      currentNodeId: null,
      messages: fallbackMessages,
      outboundMessages: [{ kind: "text", body: AI_INBOUND_FALLBACK_MESSAGE }],
      variables: {},
      trace: [],
    };
  }
}

/**
 * Roteia mensagem de entrada para fluxo configurado (origem -> fluxo).
 * Mantém sessão em Redis para retomar fluxos em `awaiting_input`.
 */
export async function processInboundMessage(
  input: InboundProcessInput
): Promise<InboundProcessResult> {
  const messageText = input.messageText?.trim() ?? "";
  if (!messageText) {
    return { routed: false };
  }

  const contactKey = buildContactKey({
    phone: input.phone,
    email: input.email,
    sessionId: input.metadata?.sessionId as string | undefined,
  });

  let conversationId = input.conversationId;

  if (!(await claimInboundProviderMessage(input.tenantId, input.providerMessageId))) {
    return { routed: false, conversationId };
  }

  const botGate = await shouldRouteInboundToBot({
    tenantId: input.tenantId,
    phone: input.phone,
    conversationId,
  });

  if (!botGate.route) {
    if (input.mirrorToAgentInbox && input.phone && input.providerMessageId) {
      const recorded = await recordInboundWhatsAppMessage({
        tenantId: input.tenantId,
        providerMessageId: input.providerMessageId,
        fromWaId: input.phone,
        textBody: messageText,
        contactName: input.contactName,
        timestampIso: new Date().toISOString(),
        ctwaReferral: input.ctwaReferral,
      });
      if (recorded.conversationId) {
        conversationId = recorded.conversationId;
      }
      if (recorded.duplicate) {
        return { routed: false, conversationId };
      }
    }
    if (input.phone?.trim()) {
      await clearInboundFlowSessionForPhone(input.tenantId, input.phone);
    }
    return { routed: false, conversationId: botGate.conversationId ?? conversationId };
  }

  const campaignRouteRaw = await resolveCampaignInboundRoute({
    tenantId: input.tenantId,
    phone: input.phone,
  });

  const ctwaRoute =
    !campaignRouteRaw && input.ctwaReferral
      ? await resolveCtwaInboundRoute({
          tenantId: input.tenantId,
          referral: input.ctwaReferral,
        })
      : null;

  const messageRouteEarly = ctwaRoute
    ? null
    : await resolveInboundRouteByFirstMessage({
        tenantId: input.tenantId,
        sourceType: input.sourceType,
        sourceKey: input.sourceKey,
        messageText,
      });

  const inboundRestart = isInboundRestartRoute(messageRouteEarly);
  const campaignRoute = inboundRestart || ctwaRoute ? null : campaignRouteRaw;

  if (inboundRestart && input.phone?.trim() && !ctwaRoute) {
    await clearInboundFlowSessionForPhone(input.tenantId, input.phone);
    await archiveOpenBotConversationsForPhone({
      tenantId: input.tenantId,
      phone: input.phone,
    });
  }

  if (!(await claimInboundPhoneMessage(input.tenantId, input.phone, messageText))) {
    return { routed: false, conversationId };
  }

  let freshBotSession = false;
  if (input.phone && input.providerMessageId) {
    const recorded = await recordBotPhaseInboundMessage({
      tenantId: input.tenantId,
      providerMessageId: input.providerMessageId,
      fromWaId: input.phone,
      textBody: messageText,
      contactName: input.contactName,
      timestampIso: new Date().toISOString(),
      ctwaReferral: input.ctwaReferral,
    });
    if (recorded.duplicate) {
      return { routed: false, conversationId: recorded.conversationId };
    }
    if (recorded.conversationId) {
      conversationId = recorded.conversationId;
    }
    freshBotSession = recorded.freshBotSession;
  }

  if (campaignRoute && input.phone) {
    await markCampaignRecipientResponded({
      tenantId: input.tenantId,
      phone: input.phone,
      recipientId: campaignRoute.recipientId,
      messageText,
      timestampIso: new Date().toISOString(),
    });
    if (campaignRoute.conversationId) {
      conversationId = campaignRoute.conversationId;
    }
  }

  if ((freshBotSession || messageRouteEarly) && input.phone?.trim() && !campaignRoute && !ctwaRoute) {
    await clearInboundFlowSession({
      tenantId: input.tenantId,
      contactKey,
      phone: input.phone,
      conversationId,
    });
  }

  let existingSession =
    freshBotSession || messageRouteEarly
      ? null
      : await loadInboundFlowSession({
          tenantId: input.tenantId,
          contactKey,
          phone: input.phone,
          conversationId,
        });

  if (campaignRoute || ctwaRoute) {
    const targetFlowId = campaignRoute?.flowId ?? ctwaRoute?.flow_id;
    if (existingSession && targetFlowId && existingSession.flowId !== targetFlowId) {
      await clearInboundFlowSession({
        tenantId: input.tenantId,
        contactKey,
        phone: input.phone,
        conversationId,
      });
      existingSession = null;
    }
  }
  if (existingSession) {
    const sessionConversationId = existingSession.conversationId?.trim();
    if (sessionConversationId && sessionConversationId !== conversationId?.trim()) {
      await clearInboundFlowSession({
        tenantId: input.tenantId,
        contactKey,
        phone: input.phone,
        conversationId: sessionConversationId,
      });
      existingSession = null;
    }
  }
  if (existingSession) {
    const resumeInput: ExecuteFlowInput = {
      startNodeId: existingSession.awaitingInput.nodeId,
      userInput: messageText,
      phone: input.phone ?? existingSession.phone,
      conversationId: conversationId ?? existingSession.conversationId,
      sessionId: existingSession.sessionId,
      awaitingStartedAt: existingSession.awaitingInput.awaitingStartedAt,
      resumeReason: "input",
      variables: existingSession.variables,
    };

    const result = await runFlowWithAiFallback({
      tenantId: input.tenantId,
      flowId: existingSession.flowId,
      sourceType: existingSession.sourceType,
      sourceKey: existingSession.sourceKey,
      messageText,
      phone: input.phone ?? existingSession.phone,
      contactName: input.contactName,
      email: input.email,
      conversationId,
      contactKey,
      executeInput: resumeInput,
      resumed: true,
    });

    await deliverOutboundIfWhatsApp({
      tenantId: input.tenantId,
      phone: input.phone,
      conversationId,
      outboundMessages: result.outboundMessages,
      messages: result.messages,
    });
    await finalizeDeferredConversationClosure({
      tenantId: input.tenantId,
      defer: result.deferConversationClosure,
    });

    if (result.status === "awaiting_input" && result.awaitingInput) {
      await saveInboundFlowSession({
        ...existingSession,
        variables: result.variables,
        awaitingInput: result.awaitingInput,
        conversationId: conversationId ?? existingSession.conversationId,
        phone: input.phone ?? existingSession.phone,
      });
    } else {
      await clearInboundFlowSession({
        tenantId: input.tenantId,
        contactKey,
        phone: input.phone,
        conversationId: conversationId ?? existingSession.conversationId,
      });
    }

    return {
      routed: true,
      flowId: existingSession.flowId,
      status: result.status,
      resumed: true,
      conversationId,
      messages: result.messages,
    };
  }

  const route = campaignRoute
    ? { flow_id: campaignRoute.flowId, source_type: input.sourceType, source_key: input.sourceKey }
    : ctwaRoute
      ? {
          flow_id: ctwaRoute.flow_id,
          source_type: "ctwa",
          source_key: buildCtwaSourceKey(input.ctwaReferral!),
        }
      : messageRouteEarly ??
        (await resolveInboundRoute({
          tenantId: input.tenantId,
          sourceType: input.sourceType,
          sourceKey: input.sourceKey,
        }));

  if (!route?.flow_id) {
    return { routed: false, conversationId };
  }

  const result = await runFlowWithAiFallback({
    tenantId: input.tenantId,
    flowId: route.flow_id,
    sourceType: route.source_type ?? input.sourceType,
    sourceKey: route.source_key ?? input.sourceKey,
    messageText,
    phone: input.phone,
    contactName: input.contactName,
    email: input.email,
    conversationId,
    contactKey,
  });

  await deliverOutboundIfWhatsApp({
    tenantId: input.tenantId,
    phone: input.phone,
    conversationId,
    outboundMessages: result.outboundMessages,
    messages: result.messages,
  });
  await finalizeDeferredConversationClosure({
    tenantId: input.tenantId,
    defer: result.deferConversationClosure,
  });

  if (result.status === "awaiting_input" && result.awaitingInput) {
    await saveInboundFlowSession({
      flowId: route.flow_id,
      tenantId: input.tenantId,
      contactKey,
      phone: input.phone,
      conversationId,
      sessionId: `${route.source_type ?? input.sourceType}:${route.source_key ?? input.sourceKey}:${contactKey}`,
      variables: result.variables,
      awaitingInput: result.awaitingInput,
      sourceType: route.source_type ?? input.sourceType,
      sourceKey: route.source_key ?? input.sourceKey,
    });
  }

  return {
    routed: true,
    flowId: route.flow_id,
    status: result.status,
    resumed: false,
    conversationId,
    messages: result.messages,
  };
}
