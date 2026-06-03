export type ConversaTransition = {
  id: string;
  label?: string;
  condition: string;
  next_node_id: string;
};

export type ConversaNodeConfig = {
  contentMode: "prompt" | "static";
  prompt: string;
  staticSpeech: string;
  isGlobal: boolean;
  personaId: string | null;
  transitions: ConversaTransition[];
  defaultNextNodeId: string | null;
};

import type { CapturarEntradaAwaiting } from "./capturar-entrada";

export function buildConversaAwaiting(input: {
  nodeId: string;
  prompt: string;
}): CapturarEntradaAwaiting {
  return {
    nodeId: input.nodeId,
    prompt: input.prompt,
    promptKey: "conversa",
    inputMode: "text",
    options: [],
    minSelections: 1,
    maxSelections: 1,
    variableName: "last_user_message",
    awaitingStartedAt: new Date().toISOString(),
  };
}

export function parseConversaNodeConfig(raw: unknown): ConversaNodeConfig {
  const c =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const legacyContent = typeof c.content === "string" ? c.content : "";
  const mode = c.contentMode === "static" ? "static" : "prompt";
  const transitions: ConversaTransition[] = [];
  if (Array.isArray(c.transitions)) {
    for (const t of c.transitions) {
      if (!t || typeof t !== "object") continue;
      const row = t as Record<string, unknown>;
      const next = typeof row.next_node_id === "string" ? row.next_node_id.trim() : "";
      const condition = typeof row.condition === "string" ? row.condition.trim() : "";
      if (!next || !condition) continue;
      transitions.push({
        id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : `tr_${transitions.length + 1}`,
        label: typeof row.label === "string" ? row.label : undefined,
        condition,
        next_node_id: next,
      });
    }
  }
  return {
    contentMode: mode,
    prompt:
      typeof c.prompt === "string" && c.prompt.trim()
        ? c.prompt.trim()
        : legacyContent.trim(),
    staticSpeech:
      typeof c.staticSpeech === "string" && c.staticSpeech.trim()
        ? c.staticSpeech.trim()
        : legacyContent.trim(),
    isGlobal: c.isGlobal === true,
    personaId:
      typeof c.personaId === "string" && c.personaId.trim() ? c.personaId.trim() : null,
    transitions,
    defaultNextNodeId:
      typeof c.default_next_node_id === "string" && c.default_next_node_id.trim()
        ? c.default_next_node_id.trim()
        : typeof c.next_node_id === "string" && c.next_node_id.trim()
          ? c.next_node_id.trim()
          : null,
  };
}
