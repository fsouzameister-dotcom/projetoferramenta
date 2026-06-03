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

/** Obtém URL temporária para download de mídia recebida (Meta). */
export async function getWhatsAppMediaUrl(input: {
  mediaId: string;
  accessToken: string;
  phoneNumberId?: string;
}): Promise<{ ok: true; url: string; mimeType?: string } | { ok: false; message: string }> {
  const q = input.phoneNumberId
    ? `?phone_number_id=${encodeURIComponent(input.phoneNumberId)}`
    : "";
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.mediaId)}${q}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json?.error as { message?: string } | undefined;
    return { ok: false, message: err?.message ?? res.statusText ?? "Erro ao obter mídia" };
  }
  const mediaUrl = typeof json.url === "string" ? json.url : "";
  if (!mediaUrl) return { ok: false, message: "Resposta sem url de mídia" };
  const mimeType = typeof json.mime_type === "string" ? json.mime_type : undefined;
  return { ok: true, url: mediaUrl, mimeType };
}

export async function downloadWhatsAppMediaBuffer(mediaUrl: string, accessToken: string): Promise<Buffer> {
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Falha ao baixar mídia: ${res.statusText}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

/** Upload de imagem para envio (multipart). */
export async function uploadWhatsAppMedia(input: {
  phoneNumberId: string;
  accessToken: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<WhatsAppSendTextResult> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/media`;
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append(
    "file",
    new Blob([Uint8Array.from(input.buffer)], { type: input.mimeType }),
    input.fileName || "image.jpg"
  );

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}` },
    body: form,
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json?.error as
      | { message?: string; code?: number; error_subcode?: number }
      | undefined;
    const numeric = err ? graphWhatsAppNumericCode(err) : undefined;
    return {
      ok: false,
      message: err?.message ?? res.statusText ?? "Erro upload mídia",
      code: numeric,
      details: JSON.stringify(json),
    };
  }
  const mediaId = typeof json.id === "string" ? json.id : "";
  if (!mediaId) {
    return { ok: false, message: "Upload sem id de mídia", details: JSON.stringify(json) };
  }
  return { ok: true, messageId: mediaId };
}

export async function sendWhatsAppImageMessage(input: {
  phoneNumberId: string;
  accessToken: string;
  toDigits: string;
  mediaId: string;
  caption?: string;
}): Promise<WhatsAppSendTextResult> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`;
  const image: Record<string, string> = { id: input.mediaId };
  if (input.caption?.trim()) {
    image.caption = input.caption.trim().slice(0, 1024);
  }
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.toDigits.replace(/\D/g, ""),
    type: "image",
    image,
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

export async function sendWhatsAppLocationMessage(input: {
  phoneNumberId: string;
  accessToken: string;
  toDigits: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}): Promise<WhatsAppSendTextResult> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`;
  const location: Record<string, string | number> = {
    latitude: input.latitude,
    longitude: input.longitude,
  };
  if (input.name?.trim()) location.name = input.name.trim().slice(0, 256);
  if (input.address?.trim()) location.address = input.address.trim().slice(0, 256);
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.toDigits.replace(/\D/g, ""),
    type: "location",
    location,
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

export async function sendWhatsAppContactMessage(input: {
  phoneNumberId: string;
  accessToken: string;
  toDigits: string;
  name: string;
  phone: string;
}): Promise<WhatsAppSendTextResult> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`;
  const formattedName = input.name.trim().slice(0, 256) || "Contato";
  const phone = input.phone.replace(/\s/g, "");
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.toDigits.replace(/\D/g, ""),
    type: "contacts",
    contacts: [
      {
        name: { formatted_name: formattedName },
        phones: [{ phone, type: "CELL" }],
      },
    ],
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

export async function sendWhatsAppAudioMessage(input: {
  phoneNumberId: string;
  accessToken: string;
  toDigits: string;
  mediaId: string;
  voice?: boolean;
}): Promise<WhatsAppSendTextResult> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`;
  const audio: Record<string, string | boolean> = { id: input.mediaId };
  if (input.voice) {
    audio.voice = true;
  }
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.toDigits.replace(/\D/g, ""),
    type: "audio",
    audio,
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

export async function sendWhatsAppDocumentMessage(input: {
  phoneNumberId: string;
  accessToken: string;
  toDigits: string;
  mediaId: string;
  fileName?: string;
  caption?: string;
}): Promise<WhatsAppSendTextResult> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`;
  const document: Record<string, string> = { id: input.mediaId };
  if (input.fileName?.trim()) {
    document.filename = input.fileName.trim().slice(0, 240);
  }
  if (input.caption?.trim()) {
    document.caption = input.caption.trim().slice(0, 1024);
  }
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.toDigits.replace(/\D/g, ""),
    type: "document",
    document,
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

/** Envia template aprovado na Meta (fora da janela de 24h). */
export async function sendWhatsAppTemplateMessage(input: {
  phoneNumberId: string;
  accessToken: string;
  toDigits: string;
  templateName: string;
  languageCode?: string;
  templateParams?: Record<string, string>;
}): Promise<WhatsAppSendTextResult> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`;
  const params = input.templateParams ?? {};
  const sortedKeys = Object.keys(params).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  const bodyParameters = sortedKeys.map((key) => ({
    type: "text" as const,
    text: String(params[key] ?? ""),
  }));

  const template: Record<string, unknown> = {
    name: input.templateName.trim(),
    language: { code: input.languageCode?.trim() || "pt_BR" },
  };
  if (bodyParameters.length > 0) {
    template.components = [{ type: "body", parameters: bodyParameters }];
  }

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.toDigits.replace(/\D/g, ""),
    type: "template",
    template,
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

export type WhatsAppReplyButton = {
  id: string;
  title: string;
};

export type WhatsAppListRow = {
  id: string;
  title: string;
  description?: string;
};

/**
 * Botões de resposta rápida (máx. 3). Corpo da mensagem até 1024 caracteres.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages
 */
export async function sendWhatsAppInteractiveReplyButtons(input: {
  phoneNumberId: string;
  accessToken: string;
  toDigits: string;
  bodyText: string;
  buttons: WhatsAppReplyButton[];
}): Promise<WhatsAppSendTextResult> {
  const buttons = input.buttons.slice(0, 3).map((b) => ({
    type: "reply" as const,
    reply: {
      id: b.id.slice(0, 256),
      title: b.title.slice(0, 20),
    },
  }));
  if (buttons.length === 0) {
    return sendWhatsAppTextMessage({
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
      toDigits: input.toDigits,
      textBody: input.bodyText,
    });
  }

  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.toDigits.replace(/\D/g, ""),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: input.bodyText.slice(0, 1024) },
      action: { buttons },
    },
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

/**
 * Lista interativa (máx. 10 linhas por seção). Corpo da mensagem até 1024 caracteres.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-list-messages
 */
export async function sendWhatsAppInteractiveListMessage(input: {
  phoneNumberId: string;
  accessToken: string;
  toDigits: string;
  bodyText: string;
  buttonText: string;
  sectionTitle?: string;
  rows: WhatsAppListRow[];
}): Promise<WhatsAppSendTextResult> {
  const rows = input.rows.slice(0, 10).map((row) => ({
    id: row.id.slice(0, 200),
    title: row.title.slice(0, 24),
    description: row.description?.slice(0, 72),
  }));
  if (rows.length === 0) {
    return sendWhatsAppTextMessage({
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
      toDigits: input.toDigits,
      textBody: input.bodyText,
    });
  }

  const url = `${GRAPH_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.toDigits.replace(/\D/g, ""),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: input.bodyText.slice(0, 1024) },
      action: {
        button: input.buttonText.slice(0, 20),
        sections: [
          {
            title: input.sectionTitle?.slice(0, 24),
            rows,
          },
        ],
      },
    },
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
      kind: "inbound_image";
      phoneNumberId: string;
      wabaId: string;
      messageId: string;
      fromWaId: string;
      timestampSec: number;
      mediaId: string;
      mimeType?: string;
      caption?: string;
      contactName?: string;
    }
  | {
      kind: "inbound_audio";
      phoneNumberId: string;
      wabaId: string;
      messageId: string;
      fromWaId: string;
      timestampSec: number;
      mediaId: string;
      mimeType?: string;
      voice?: boolean;
      contactName?: string;
    }
  | {
      kind: "inbound_document";
      phoneNumberId: string;
      wabaId: string;
      messageId: string;
      fromWaId: string;
      timestampSec: number;
      mediaId: string;
      mimeType?: string;
      fileName?: string;
      caption?: string;
      contactName?: string;
    }
  | {
      kind: "inbound_location";
      phoneNumberId: string;
      wabaId: string;
      messageId: string;
      fromWaId: string;
      timestampSec: number;
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
      contactName?: string;
    }
  | {
      kind: "inbound_contacts";
      phoneNumberId: string;
      wabaId: string;
      messageId: string;
      fromWaId: string;
      timestampSec: number;
      sharedContacts: Array<{ name: string; phone: string }>;
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
            image?: { id?: string; mime_type?: string; caption?: string };
            audio?: { id?: string; mime_type?: string; voice?: boolean };
            document?: {
              id?: string;
              mime_type?: string;
              filename?: string;
              caption?: string;
            };
            location?: {
              latitude?: number;
              longitude?: number;
              name?: string;
              address?: string;
            };
            contacts?: Array<{
              name?: { formatted_name?: string };
              phones?: Array<{ phone?: string; wa_id?: string }>;
            }>;
            interactive?: {
              type?: string;
              button_reply?: { id?: string };
              list_reply?: { id?: string };
            };
          }>
        | undefined;

      const contacts = value.contacts as
        | Array<{ wa_id?: string; profile?: { name?: string } }>
        | undefined;

      if (Array.isArray(messages)) {
        for (const msg of messages) {
          const fromWaId = msg.from ?? "";
          const mid = msg.id ?? "";
          if (!fromWaId || !mid) continue;

          let textBody: string | undefined;
          if (msg.type === "text" && msg.text?.body) {
            textBody = msg.text.body;
          } else if (msg.type === "interactive") {
            const interactive = msg.interactive;
            if (interactive?.type === "button_reply" && interactive.button_reply?.id) {
              textBody = interactive.button_reply.id;
            } else if (interactive?.type === "list_reply" && interactive.list_reply?.id) {
              textBody = interactive.list_reply.id;
            }
          } else if (msg.type === "image" && msg.image?.id) {
            let contactName: string | undefined;
            const c = contacts?.find((x) => (x as { wa_id?: string }).wa_id === fromWaId);
            if (c?.profile?.name) contactName = c.profile.name;
            out.push({
              kind: "inbound_image",
              phoneNumberId,
              wabaId,
              messageId: mid,
              fromWaId,
              timestampSec: Number(msg.timestamp ?? 0) || 0,
              mediaId: msg.image.id,
              mimeType: msg.image.mime_type,
              caption: msg.image.caption,
              contactName,
            });
            continue;
          } else if (msg.type === "audio" && msg.audio?.id) {
            let contactName: string | undefined;
            const c = contacts?.find((x) => (x as { wa_id?: string }).wa_id === fromWaId);
            if (c?.profile?.name) contactName = c.profile.name;
            out.push({
              kind: "inbound_audio",
              phoneNumberId,
              wabaId,
              messageId: mid,
              fromWaId,
              timestampSec: Number(msg.timestamp ?? 0) || 0,
              mediaId: msg.audio.id,
              mimeType: msg.audio.mime_type,
              voice: msg.audio.voice === true,
              contactName,
            });
            continue;
          } else if (msg.type === "document" && msg.document?.id) {
            let contactName: string | undefined;
            const c = contacts?.find((x) => (x as { wa_id?: string }).wa_id === fromWaId);
            if (c?.profile?.name) contactName = c.profile.name;
            out.push({
              kind: "inbound_document",
              phoneNumberId,
              wabaId,
              messageId: mid,
              fromWaId,
              timestampSec: Number(msg.timestamp ?? 0) || 0,
              mediaId: msg.document.id,
              mimeType: msg.document.mime_type,
              fileName: msg.document.filename,
              caption: msg.document.caption,
              contactName,
            });
            continue;
          } else if (msg.type === "location" && msg.location) {
            const lat = Number(msg.location.latitude);
            const lng = Number(msg.location.longitude);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              let contactName: string | undefined;
              const c = contacts?.find((x) => (x as { wa_id?: string }).wa_id === fromWaId);
              if (c?.profile?.name) contactName = c.profile.name;
              out.push({
                kind: "inbound_location",
                phoneNumberId,
                wabaId,
                messageId: mid,
                fromWaId,
                timestampSec: Number(msg.timestamp ?? 0) || 0,
                latitude: lat,
                longitude: lng,
                name: msg.location.name,
                address: msg.location.address,
                contactName,
              });
              continue;
            }
          } else if (msg.type === "contacts" && Array.isArray(msg.contacts) && msg.contacts.length) {
            const sharedContacts: Array<{ name: string; phone: string }> = [];
            for (const shared of msg.contacts) {
              const name =
                shared.name?.formatted_name?.trim() ||
                shared.phones?.[0]?.phone?.trim() ||
                "Contato";
              const phone =
                shared.phones?.[0]?.phone?.trim() ||
                shared.phones?.[0]?.wa_id?.trim() ||
                "";
              if (phone) sharedContacts.push({ name, phone });
            }
            if (sharedContacts.length) {
              let contactName: string | undefined;
              const c = contacts?.find((x) => (x as { wa_id?: string }).wa_id === fromWaId);
              if (c?.profile?.name) contactName = c.profile.name;
              out.push({
                kind: "inbound_contacts",
                phoneNumberId,
                wabaId,
                messageId: mid,
                fromWaId,
                timestampSec: Number(msg.timestamp ?? 0) || 0,
                sharedContacts,
                contactName,
              });
              continue;
            }
          }
          if (!textBody) continue;

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
            textBody,
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
