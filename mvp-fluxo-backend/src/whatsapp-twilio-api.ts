import { createHmac, timingSafeEqual } from "crypto";

export type TwilioSendTextResult =
  | { ok: true; messageId: string }
  | { ok: false; message: string; code?: number; details?: string };

function basicAuthHeader(accountSid: string, authToken: string): string {
  const raw = `${accountSid}:${authToken}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

function toWhatsAppAddress(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d.startsWith("+") ? `whatsapp:${d}` : `whatsapp:+${d}`;
}

/**
 * Envia mensagem de texto via Twilio API for WhatsApp (REST).
 * @see https://www.twilio.com/docs/whatsapp/api
 */
export async function sendTwilioWhatsAppTextMessage(input: {
  accountSid: string;
  authToken: string;
  /** E.164 com +, ex.: +551150284949 (sem prefixo whatsapp:) */
  fromE164: string;
  toDigits: string;
  textBody: string;
}): Promise<TwilioSendTextResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    input.accountSid
  )}/Messages.json`;

  const from = toWhatsAppAddress(input.fromE164);
  const to = toWhatsAppAddress(input.toDigits);

  const body = new URLSearchParams();
  body.set("From", from);
  body.set("To", to);
  body.set("Body", input.textBody);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(input.accountSid, input.authToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* Twilio pode responder HTML em erro raro */
  }

  if (!res.ok) {
    const err = json?.message as string | undefined;
    const code = json?.code as number | undefined;
    return {
      ok: false,
      message: err ?? res.statusText ?? "Erro Twilio",
      code,
      details: text.slice(0, 2000),
    };
  }

  const sid = json?.sid as string | undefined;
  if (!sid) {
    return { ok: false, message: "Resposta Twilio sem sid", details: text.slice(0, 2000) };
  }
  return { ok: true, messageId: sid };
}

/**
 * Valida `X-Twilio-Signature` (HMAC-SHA1 em Base64 da URL completa + parâmetros ordenados).
 * @see https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioWebhookSignature(input: {
  authToken: string;
  fullUrl: string;
  /** Corpo do webhook como objeto chave/valor (POST form). */
  params: Record<string, string>;
  signatureHeader: string | undefined;
}): boolean {
  if (!input.signatureHeader) return false;
  const sortedKeys = Object.keys(input.params).sort();
  let data = input.fullUrl;
  for (const k of sortedKeys) {
    data += k + input.params[k];
  }
  const expected = createHmac("sha1", input.authToken).update(data, "utf8").digest("base64");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(input.signatureHeader, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
