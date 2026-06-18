const WHATSAPP_PROVIDER_TWILIO = "twilio_whatsapp";

/** Canais WhatsApp usados em webhooks (Twilio e Meta Cloud API). */
export const WHATSAPP_INBOUND_SOURCE_TYPES = ["twilio_whatsapp", "whatsapp_meta"] as const;

export function isWhatsAppInboundSourceType(sourceType: string): boolean {
  const normalized = sourceType.trim();
  return (WHATSAPP_INBOUND_SOURCE_TYPES as readonly string[]).includes(normalized);
}

function twilioRoutePhoneDigits(sourceKey: string): string {
  const trimmed = sourceKey.trim();
  if (!trimmed) return "";
  const prefixed = trimmed.match(/^twilio:[^:]+:(\d+)$/i);
  if (prefixed) return prefixed[1];
  return trimmed.replace(/\D/g, "");
}

/** Verifica se uma rota com gatilho de mensagem se aplica ao canal inbound atual. */
export function inboundTriggerRouteMatchesSource(input: {
  routeSourceType: string;
  routeSourceKey: string;
  routeMetadata: Record<string, unknown>;
  inboundSourceType: string;
  inboundSourceKey: string;
}): boolean {
  const inboundSourceType = input.inboundSourceType.trim();
  const inboundSourceKey = input.inboundSourceKey.trim();
  const routeKey = input.routeSourceKey.trim();
  const meta = input.routeMetadata;
  if (!inboundSourceType || !inboundSourceKey || !routeKey) return false;

  if (routeKey === inboundSourceKey) return true;

  const incomingDigits =
    inboundSourceType === WHATSAPP_PROVIDER_TWILIO
      ? twilioRoutePhoneDigits(inboundSourceKey)
      : "";
  const routeDigits =
    input.routeSourceType.trim() === WHATSAPP_PROVIDER_TWILIO
      ? twilioRoutePhoneDigits(routeKey)
      : "";

  if (incomingDigits && routeDigits && incomingDigits === routeDigits) return true;

  if (meta.match_any_source_key === true) {
    return (
      isWhatsAppInboundSourceType(inboundSourceType) &&
      isWhatsAppInboundSourceType(input.routeSourceType.trim())
    );
  }

  return false;
}
