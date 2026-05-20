import { createHmac, timingSafeEqual } from "crypto";

export type TwilioSendTextResult =
  | { ok: true; messageId: string }
  | { ok: false; message: string; code?: number; details?: string };

function basicAuthHeader(accountSid: string, authToken: string): string {
  const raw = `${accountSid}:${authToken}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

export type TwilioContentTemplateItem = {
  contentSid: string;
  friendlyName: string;
  language: string | null;
  /** Chaves alinhadas ao JSON `ContentVariables` da Twilio (ex.: `"1"`, `"2"`). */
  variables: string[];
};

function collectTwilioPlaceholderIndices(value: unknown, acc: Set<string>): void {
  if (typeof value === "string") {
    const re = /\{\{(\d+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) acc.add(m[1]!);
    return;
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      for (const x of value) collectTwilioPlaceholderIndices(x, acc);
    } else {
      for (const x of Object.values(value as Record<string, unknown>)) {
        collectTwilioPlaceholderIndices(x, acc);
      }
    }
  }
}

function extractVariablesFromContentTypes(types: unknown): string[] {
  const acc = new Set<string>();
  collectTwilioPlaceholderIndices(types, acc);
  return [...acc].sort((a, b) => Number(a) - Number(b));
}

type TwilioContentListMeta = {
  next_page_url?: string | null;
};

/**
 * Lista templates do Twilio Content API (usado com WhatsApp / ContentSid).
 * @see https://www.twilio.com/docs/content/using-the-rest-api
 */
export async function fetchTwilioContentTemplates(input: {
  accountSid: string;
  authToken: string;
}): Promise<TwilioContentTemplateItem[]> {
  const auth = basicAuthHeader(input.accountSid, input.authToken);
  const out: TwilioContentTemplateItem[] = [];
  let url: string | null =
    "https://content.twilio.com/v1/Content?PageSize=100";

  while (url) {
    const res = await fetch(url, { headers: { Authorization: auth } });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`Twilio Content: resposta inválida (${res.status})`);
    }
    if (!res.ok) {
      const msg = (json?.message as string) || text.slice(0, 500);
      throw new Error(`Twilio Content ${res.status}: ${msg}`);
    }

    const contents = json.contents as Record<string, unknown>[] | undefined;

    for (const raw of contents ?? []) {
      const sidStr = typeof raw.sid === "string" ? raw.sid : "";
      if (!sidStr.startsWith("HX")) continue;
      const friendly =
        typeof raw.friendly_name === "string" ? raw.friendly_name : sidStr;
      const lang = typeof raw.language === "string" ? raw.language : null;
      const vars = extractVariablesFromContentTypes(raw.types);
      out.push({
        contentSid: sidStr,
        friendlyName: friendly,
        language: lang,
        variables: vars,
      });
    }

    const meta = json.meta as TwilioContentListMeta | undefined;
    url = meta?.next_page_url && typeof meta.next_page_url === "string" ? meta.next_page_url : null;
  }

  return out;
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
