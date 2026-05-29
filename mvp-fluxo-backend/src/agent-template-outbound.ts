import {
  getOutboundWhatsAppContext,
  WHATSAPP_PROVIDER_CLOUD,
  WHATSAPP_PROVIDER_TWILIO,
} from "./whatsapp-channels";
import { sendWhatsAppTemplateMessage } from "./whatsapp-cloud-api";
import { sendTwilioWhatsAppContentMessage } from "./whatsapp-twilio-api";

function phoneDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

export type TemplateOutboundSendResult =
  | { ok: true; messageId: string; provider: "whatsapp_cloud_api" | "twilio_whatsapp" }
  | {
      ok: false;
      message: string;
      code?: string;
      details?: string;
    };

function normalizeMetaTemplateName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function formatTemplateErrorDescription(input: {
  code?: string;
  message: string;
  details?: string;
}): string {
  const parts = [
    input.code ? `${input.code}` : null,
    input.message?.trim() || null,
  ].filter((x): x is string => Boolean(x));
  if (parts.length === 0 && input.details) {
    return input.details.slice(0, 500);
  }
  return parts.join(" — ");
}

/**
 * Dispara template real via Meta Cloud API ou Twilio Content API.
 */
export async function sendOutboundTemplateMessage(input: {
  tenantId: string;
  phone: string;
  templateName: string;
  templateContentSid?: string;
  templateParams?: Record<string, string>;
  languageCode?: string;
}): Promise<TemplateOutboundSendResult> {
  const waCtx = await getOutboundWhatsAppContext(input.tenantId);
  if (!waCtx) {
    return {
      ok: false,
      message: "Nenhum canal WhatsApp configurado para este tenant",
      code: "NO_WHATSAPP_CHANNEL",
    };
  }

  const toDigits = phoneDigitsOnly(input.phone);
  const contentSid = input.templateContentSid?.trim() ?? "";
  const params = input.templateParams ?? {};

  if (waCtx.provider === WHATSAPP_PROVIDER_TWILIO) {
    if (!contentSid.startsWith("HX")) {
      return {
        ok: false,
        message: "Para Twilio, informe o Content SID do template (HX…)",
        code: "TEMPLATE_CONTENT_SID_REQUIRED",
      };
    }
    const result = await sendTwilioWhatsAppContentMessage({
      accountSid: waCtx.accountSid,
      authToken: waCtx.authToken,
      fromE164: waCtx.fromE164,
      toDigits,
      contentSid,
      contentVariables: params,
    });
    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        code: result.code != null ? String(result.code) : "TWILIO_API",
        details: result.details,
      };
    }
    return { ok: true, messageId: result.messageId, provider: "twilio_whatsapp" };
  }

  if (waCtx.provider === WHATSAPP_PROVIDER_CLOUD) {
    const templateName = normalizeMetaTemplateName(input.templateName);
    if (!templateName) {
      return {
        ok: false,
        message: "Nome do template Meta inválido",
        code: "INVALID_TEMPLATE_NAME",
      };
    }
    const result = await sendWhatsAppTemplateMessage({
      phoneNumberId: waCtx.phoneNumberId,
      accessToken: waCtx.accessToken,
      toDigits,
      templateName,
      languageCode: input.languageCode,
      templateParams: params,
    });
    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        code: result.code != null ? String(result.code) : "GRAPH_API",
        details: result.details,
      };
    }
    return { ok: true, messageId: result.messageId, provider: "whatsapp_cloud_api" };
  }

  return {
    ok: false,
    message: "Provedor WhatsApp não suportado",
    code: "UNKNOWN_PROVIDER",
  };
}

export function buildTemplateMessageText(input: {
  botName: string;
  templateName: string;
  templateContentSid?: string;
  sendOk: boolean;
}): string {
  const sidSuffix = input.templateContentSid?.trim()
    ? ` (${input.templateContentSid.trim()})`
    : "";
  if (input.sendOk) {
    return `${input.botName}:\nTemplate "${input.templateName}" enviado${sidSuffix}`;
  }
  return `${input.botName}:\nFalha ao enviar template "${input.templateName}"${sidSuffix}`;
}

export { formatTemplateErrorDescription };
