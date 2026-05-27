/** Limites WhatsApp Cloud API — botões/lista interativa */
export const MENSAGEM_BUTTONS_MAX = 3;
export const MENSAGEM_BUTTON_LABEL_MAX = 20;
export const MENSAGEM_BUTTON_ID_MAX = 256;
export const MENSAGEM_LIST_ROWS_MAX = 10;
export const MENSAGEM_LIST_ROW_TITLE_MAX = 24;
export const MENSAGEM_LIST_ROW_DESCRIPTION_MAX = 72;
export const MENSAGEM_LIST_ROW_ID_MAX = 200;
export const MENSAGEM_LIST_BUTTON_TEXT_MAX = 20;
export const MENSAGEM_LIST_SECTION_TITLE_MAX = 24;

export type MensagemButton = {
  id: string;
  label: string;
};

export type MensagemListItem = {
  id: string;
  label: string;
  description?: string;
};

export type FlowOutboundMessage = {
  kind: "text" | "interactive_buttons" | "interactive_list";
  body: string;
  buttons?: MensagemButton[];
  listItems?: MensagemListItem[];
  listButtonText?: string;
  listSectionTitle?: string;
};

export type MensagemNodeConfig = {
  content: string;
  sendDelaySeconds: number;
  buttons: MensagemButton[];
  listItems: MensagemListItem[];
  interactiveType: "none" | "buttons" | "list";
  listButtonText: string;
  listSectionTitle: string;
  nextNodeId: string | null;
};

function slugButtonId(label: string, index: number): string {
  const base = label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || `btn_${index + 1}`;
}

export function parseMensagemButtons(raw: unknown): MensagemButton[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MensagemButton[] = [];
  for (let i = 0; i < raw.length && out.length < MENSAGEM_BUTTONS_MAX; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const label =
      typeof item.label === "string" && item.label.trim()
        ? item.label.trim().slice(0, MENSAGEM_BUTTON_LABEL_MAX)
        : "";
    if (!label) continue;
    let id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim().slice(0, MENSAGEM_BUTTON_ID_MAX)
        : slugButtonId(label, i);
    while (seen.has(id)) {
      id = `${id}_${out.length + 1}`.slice(0, MENSAGEM_BUTTON_ID_MAX);
    }
    seen.add(id);
    out.push({ id, label });
  }
  return out;
}

export function parseMensagemListItems(raw: unknown): MensagemListItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MensagemListItem[] = [];
  for (let i = 0; i < raw.length && out.length < MENSAGEM_LIST_ROWS_MAX; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const label =
      typeof item.label === "string" && item.label.trim()
        ? item.label.trim().slice(0, MENSAGEM_LIST_ROW_TITLE_MAX)
        : "";
    if (!label) continue;
    const description =
      typeof item.description === "string" && item.description.trim()
        ? item.description.trim().slice(0, MENSAGEM_LIST_ROW_DESCRIPTION_MAX)
        : undefined;
    let id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim().slice(0, MENSAGEM_LIST_ROW_ID_MAX)
        : slugButtonId(label, i);
    while (seen.has(id)) {
      id = `${id}_${out.length + 1}`.slice(0, MENSAGEM_LIST_ROW_ID_MAX);
    }
    seen.add(id);
    out.push({ id, label, description });
  }
  return out;
}

export function parseMensagemNodeConfig(
  raw: Record<string, unknown>
): MensagemNodeConfig {
  const content =
    typeof raw.content === "string"
      ? raw.content
      : typeof raw.text === "string"
        ? raw.text
        : "";
  const sendDelaySeconds =
    typeof raw.send_delay_seconds === "number" && raw.send_delay_seconds > 0
      ? Math.min(Math.floor(raw.send_delay_seconds), 300)
      : typeof raw.delay_after_seconds === "number" && raw.delay_after_seconds > 0
        ? Math.min(Math.floor(raw.delay_after_seconds), 300)
        : 0;
  const buttons = parseMensagemButtons(raw.buttons ?? raw.reply_buttons);
  const listItems = parseMensagemListItems(raw.list_items ?? raw.listItems);
  const interactiveTypeRaw =
    typeof raw.interactive_type === "string" ? raw.interactive_type.trim().toLowerCase() : "";
  const interactiveType: "none" | "buttons" | "list" =
    interactiveTypeRaw === "list"
      ? "list"
      : interactiveTypeRaw === "buttons"
        ? "buttons"
        : buttons.length > 0
          ? "buttons"
          : "none";
  const listButtonTextRaw =
    typeof raw.list_button_text === "string"
      ? raw.list_button_text.trim()
      : typeof raw.listButtonText === "string"
        ? raw.listButtonText.trim()
        : "";
  const listButtonText = (listButtonTextRaw || "Ver opções").slice(0, MENSAGEM_LIST_BUTTON_TEXT_MAX);
  const listSectionTitleRaw =
    typeof raw.list_section_title === "string"
      ? raw.list_section_title.trim()
      : typeof raw.listSectionTitle === "string"
        ? raw.listSectionTitle.trim()
        : "";
  const listSectionTitle = (listSectionTitleRaw || "Opções").slice(
    0,
    MENSAGEM_LIST_SECTION_TITLE_MAX
  );
  const nextNodeId =
    typeof raw.next_node_id === "string" && raw.next_node_id.trim()
      ? raw.next_node_id.trim()
      : null;
  return {
    content,
    sendDelaySeconds,
    buttons,
    listItems,
    interactiveType,
    listButtonText,
    listSectionTitle,
    nextNodeId,
  };
}

/** Texto auxiliar quando o canal não suporta botões nativos (ex.: Twilio sessão). */
export function formatMensagemBodyWithButtonFallback(
  body: string,
  buttons: MensagemButton[]
): string {
  if (!buttons.length) return body;
  const lines = buttons.map((b, i) => `${i + 1}. ${b.label}`);
  return `${body}\n\n${lines.join("\n")}`;
}

export function formatMensagemBodyWithListFallback(
  body: string,
  listItems: MensagemListItem[]
): string {
  if (!listItems.length) return body;
  const lines = listItems.map((item, i) =>
    item.description
      ? `${i + 1}. ${item.label} — ${item.description}`
      : `${i + 1}. ${item.label}`
  );
  return `${body}\n\n${lines.join("\n")}`;
}

export function executeMensagemNode(input: {
  config: Record<string, unknown>;
  variables: Record<string, unknown>;
  resolveTemplate: (text: string) => string;
}): {
  nextNodeId: string | null;
  messages: string[];
  outboundMessages: FlowOutboundMessage[];
  details: Record<string, unknown>;
} {
  const parsed = parseMensagemNodeConfig(input.config);
  const rendered = input.resolveTemplate(parsed.content);
  const hasButtons = parsed.interactiveType === "buttons" && parsed.buttons.length > 0;
  const hasList = parsed.interactiveType === "list" && parsed.listItems.length > 0;

  const outbound: FlowOutboundMessage = hasList
    ? {
        kind: "interactive_list",
        body: rendered,
        listItems: parsed.listItems,
        listButtonText: parsed.listButtonText,
        listSectionTitle: parsed.listSectionTitle,
      }
    : hasButtons
      ? { kind: "interactive_buttons", body: rendered, buttons: parsed.buttons }
      : { kind: "text", body: rendered };

  return {
    nextNodeId: parsed.nextNodeId,
    messages: [rendered],
    outboundMessages: [outbound],
    details: {
      renderedContent: rendered,
      sendDelaySeconds: parsed.sendDelaySeconds,
      interactiveType: parsed.interactiveType,
      hasButtons,
      hasList,
      buttons: parsed.buttons,
      buttonCount: parsed.buttons.length,
      listItems: parsed.listItems,
      listItemCount: parsed.listItems.length,
    },
  };
}
