import { createHmac, timingSafeEqual } from "crypto";
import { WHATSAPP_GRAPH_API_VERSION } from "./config";

const GRAPH_BASE = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}`;

export type WhatsAppSendTextResult =
  | { ok: true; messageId: string }
  | { ok: false; message: string; code?: number; details?: string };

function graphWhatsAppNumericCode(err: {
  code?: number;
  error_subcode?: number;
}): number | undefined {
  if (err.error_subcode != null) return err.error_subcode;
  return err.code;
}

export async function sendWhatsAppTextMessage(input: {
  phoneNumberId: string;
  accessToken: string;
  toDigits: string;
  textBody: string;
}): Promise<WhatsAppSendTextResult> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.toDigits.replace(/\D/g, ""),
    type: "text",
    text: { preview_url: false, body: input.textBody },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json?.error as
      | { message?: string; code?: number; error_subcode?: number }
      | undefined;
    const numeric = err ? graphWhatsAppNumericCode(err) : undefined;
    return {
      ok: false,
      message: err?.message ?? res.statusText ?? "Erro Graph API",
      code: numeric,
      details: JSON.stringify(json),
    };
  }

  const messages = json?.messages as Array<{ id?: string }> | undefined;
  const messageId = messages?.[0]?.id;
  if (!messageId) {
    return { ok: false, message: "Resposta sem messages[0].id", details: JSON.stringify(json) };
  }
  return { ok: true, messageId };
}

export type ParsedWebhookEvent =
  | {
      kind: "inbound_text";
      phoneNumberId: string;
      wabaId: string;
      messageId: string;
      fromWaId: string;
      timestampSec: number;
      textBody: string;
      contactName?: string;
    }
  | {
      kind: "status";
      phoneNumberId: string;
      messageId: string;
      status: "sent" | "delivered" | "read" | "failed";
      timestampSec: number;
      errors?: Array<{
        code?: number;
        title?: string;
        message?: string;
        error_data?: { details?: string };
      }>;
    };

export function parseWhatsAppWebhookPayload(body: unknown): ParsedWebhookEvent[] {
  if (!body || typeof body !== "object") return [];
  const root = body as {
    object?: string;
    entry?: Array<{
      id?: string;
      changes?: Array<{
        field?: string;
        value?: Record<string, unknown>;
      }>;
    }>;
  };

  if (root.object !== "whatsapp_business_account") return [];

  const out: ParsedWebhookEvent[] = [];
  for (const entry of root.entry ?? []) {
    const wabaId = entry.id ?? "";
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value || typeof value !== "object") continue;

      const meta = value.metadata as { phone_number_id?: string } | undefined;
      const phoneNumberId = meta?.phone_number_id ?? "";
      if (!phoneNumberId) continue;

      const statuses = value.statuses as
        | Array<{
            id?: string;
            status?: string;
            timestamp?: string;
            errors?: Array<{
              code?: number;
              title?: string;
              message?: string;
              error_data?: { details?: string };
            }>;
          }>
        | undefined;

      if (Array.isArray(statuses)) {
        for (const st of statuses) {
          const mid = st.id;
          const raw = st.status?.toLowerCase();
          if (!mid || !raw) continue;
          const mapped =
            raw === "sent" || raw === "delivered" || raw === "read" || raw === "failed"
              ? raw
              : null;
          if (!mapped) continue;
          out.push({
            kind: "status",
            phoneNumberId,
            messageId: mid,
            status: mapped,
            timestampSec: Number(st.timestamp ?? 0) || 0,
            errors: st.errors,
          });
        }
      }

      const messages = value.messages as
        | Array<{
            id?: string;
            from?: string;
            timestamp?: string;
            type?: string;
            text?: { body?: string };
          }>
        | undefined;

      const contacts = value.contacts as
        | Array<{ wa_id?: string; profile?: { name?: string } }>
        | undefined;

      if (Array.isArray(messages)) {
        for (const msg of messages) {
          if (msg.type !== "text" || !msg.text?.body) continue;
          const fromWaId = msg.from ?? "";
          const mid = msg.id ?? "";
          if (!fromWaId || !mid) continue;

          let contactName: string | undefined;
          const c = contacts?.find((x) => (x as { wa_id?: string }).wa_id === fromWaId);
          if (c?.profile?.name) contactName = c.profile.name;

          out.push({
            kind: "inbound_text",
            phoneNumberId,
            wabaId,
            messageId: mid,
            fromWaId,
            timestampSec: Number(msg.timestamp ?? 0) || 0,
            textBody: msg.text.body,
            contactName,
          });
        }
      }
    }
  }
  return out;
}

export function verifyWhatsAppWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const receivedHex = signatureHeader.slice("sha256=".length).trim();
  if (!/^[0-9a-f]+$/i.test(receivedHex) || expectedHex.length !== receivedHex.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(receivedHex, "hex"));
  } catch {
    return false;
  }
}
