import { generateAiText } from "./ai";
import { applyGuardrailsToText } from "./ai-guardrails";
import { buildKnowledgeContext } from "./ai-knowledge-bases";
import {
  getFlowAiSettings,
  type FlowAiSettings,
  type FlowExecutionMode,
} from "./flow-ai-settings";
import {
  parseConversaNodeConfig,
  type ConversaNodeConfig,
  type ConversaTransition,
} from "./flow-conversa-node";
import { parseJsonFromModel } from "./flow-executor-utils";

type FlowNodeLite = {
  id: string;
  type: string;
  name: string;
  config: unknown;
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function parseJsonFromAiText(text: string): Record<string, unknown> | null {
  return parseJsonFromModel(text);
}

export async function loadFlowAiContext(input: {
  flowId: string;
  tenantId: string;
  nodes: FlowNodeLite[];
}): Promise<{
  settings: FlowAiSettings;
  globalNodes: Array<{ id: string; name: string; config: ConversaNodeConfig }>;
}> {
  const settings =
    (await getFlowAiSettings(input.flowId, input.tenantId)) ?? {
      globalPrompt: "",
      language: "pt-BR",
      voiceId: "",
      executionMode: "rigid" as FlowExecutionMode,
      personaId: null,
      providerOverride: null,
      guardrailPolicyId: null,
      guardrailDeployMode: "live",
      knowledgeBaseIds: [],
    };

  const globalNodes = input.nodes
    .filter((n) => n.type === "conversa")
    .map((n) => ({ id: n.id, name: n.name, config: parseConversaNodeConfig(n.config) }))
    .filter((n) => n.config.isGlobal);

  return { settings, globalNodes };
}

function buildGlobalNodesSection(
  globalNodes: Array<{ id: string; name: string; config: ConversaNodeConfig }>
): string {
  if (!globalNodes.length) return "";
  const parts = globalNodes.map((g) => {
    const text = g.config.contentMode === "static" ? g.config.staticSpeech : g.config.prompt;
    return `### Nó global: ${g.name} (${g.id})\n${text}`;
  });
  return `\n\n## Nós globais (consulte quando necessário)\n${parts.join("\n\n")}`;
}

function buildFlexibleCatalog(nodes: FlowNodeLite[]): string {
  const conversaNodes = nodes.filter((n) => n.type === "conversa");
  if (!conversaNodes.length) return "";
  const parts = conversaNodes.map((n) => {
    const cfg = parseConversaNodeConfig(n.config);
    const body = cfg.contentMode === "static" ? cfg.staticSpeech : cfg.prompt;
    const transitions = cfg.transitions
      .map(
        (t) =>
          `- [${t.id}] ${t.label || t.condition} → next_node_id=${t.next_node_id}`
      )
      .join("\n");
    return `### Etapa: ${n.name} (nodeId=${n.id}${cfg.isGlobal ? ", global" : ""})\n${body}\nTransições:\n${transitions || "(nenhuma)"}`;
  });
  return `\n\n## Catálogo do fluxo (modo flexível)\n${parts.join("\n\n")}`;
}

export async function buildFlowSystemPrompt(input: {
  settings: FlowAiSettings;
  globalNodes: Array<{ id: string; name: string; config: ConversaNodeConfig }>;
  nodeConfig?: ConversaNodeConfig;
  nodeName?: string;
  nodes?: FlowNodeLite[];
  variables: Record<string, unknown>;
  tenantId: string;
  userMessage?: string;
}): Promise<string> {
  const kb = await buildKnowledgeContext({
    tenantId: input.tenantId,
    knowledgeBaseIds: input.settings.knowledgeBaseIds,
    queryHint: input.userMessage,
  });

  const sections = [
    `Idioma de resposta: ${input.settings.language}.`,
    input.settings.voiceId ? `Perfil de voz (referência): ${input.settings.voiceId}.` : "",
    input.settings.globalPrompt.trim()
      ? `## Prompt global do fluxo\n${input.settings.globalPrompt.trim()}`
      : "",
    buildGlobalNodesSection(input.globalNodes),
    input.settings.executionMode === "flexible" && input.nodes?.length
      ? buildFlexibleCatalog(input.nodes)
      : "",
    input.nodeConfig && input.nodeName
      ? `## Etapa atual: ${input.nodeName}\n${
          input.nodeConfig.contentMode === "static"
            ? input.nodeConfig.staticSpeech
            : input.nodeConfig.prompt
        }`
      : "",
    kb,
    `Variáveis do fluxo: ${JSON.stringify(input.variables)}`,
  ].filter(Boolean);

  return sections.join("\n");
}

export async function generateFlowAiReply(input: {
  tenantId: string;
  personaId: string;
  systemPrompt: string;
  userMessage: string;
  conversationId?: string;
}): Promise<{ text: string; provider: string; model: string }> {
  const ai = await generateAiText({
    tenantId: input.tenantId,
    personaId: input.personaId,
    message: input.userMessage,
    conversationId: input.conversationId,
    systemPromptOverride: input.systemPrompt,
  });
  return { text: ai.text, provider: ai.provider, model: ai.model };
}

export async function applyFlowGuardrails(input: {
  tenantId: string;
  settings: FlowAiSettings;
  text: string;
}): Promise<{ text: string; blocked: boolean; violations: string[] }> {
  const result = await applyGuardrailsToText({
    tenantId: input.tenantId,
    policyId: input.settings.guardrailPolicyId,
    deployMode: input.settings.guardrailDeployMode,
    text: input.text,
  });
  return {
    text: result.text,
    blocked: result.blocked,
    violations: result.violations,
  };
}

export async function resolveConversaTransition(input: {
  tenantId: string;
  personaId: string;
  settings: FlowAiSettings;
  transitions: ConversaTransition[];
  defaultNextNodeId: string | null;
  userMessage: string;
  variables: Record<string, unknown>;
  conversationId?: string;
}): Promise<{ nextNodeId: string | null; transitionId: string | null; reason: string }> {
  if (!input.transitions.length) {
    return {
      nextNodeId: input.defaultNextNodeId,
      transitionId: null,
      reason: "Sem transições; fallback default.",
    };
  }

  const catalog = input.transitions
    .map(
      (t, i) =>
        `${i + 1}. id=${t.id} | rótulo=${t.label || t.id} | condição=${t.condition} | next=${t.next_node_id}`
    )
    .join("\n");

  const instruction = [
    "Avalie a última mensagem do cliente e escolha a transição mais adequada.",
    `Mensagem do cliente: ${input.userMessage}`,
    `Transições disponíveis:\n${catalog}`,
    'Responda APENAS JSON: {"transitionId":"<id ou vazio>","reason":"<motivo curto>"}.',
    "Use transitionId vazio para fallback.",
    `Contexto: ${JSON.stringify(input.variables)}`,
  ].join("\n");

  const ai = await generateAiText({
    tenantId: input.tenantId,
    personaId: input.personaId,
    message: instruction,
    conversationId: input.conversationId,
  });

  const parsed = parseJsonFromAiText(ai.text);
  const transitionId =
    typeof parsed?.transitionId === "string" ? parsed.transitionId.trim() : "";
  const reason = typeof parsed?.reason === "string" ? parsed.reason.trim() : ai.text;

  const matched = input.transitions.find((t) => t.id === transitionId);
  if (matched) {
    return { nextNodeId: matched.next_node_id, transitionId: matched.id, reason };
  }

  return {
    nextNodeId: input.defaultNextNodeId,
    transitionId: null,
    reason: reason || "Fallback — transição não reconhecida.",
  };
}

export async function resolveFlexibleStep(input: {
  tenantId: string;
  personaId: string;
  settings: FlowAiSettings;
  nodes: FlowNodeLite[];
  globalNodes: Array<{ id: string; name: string; config: ConversaNodeConfig }>;
  currentNodeId: string | null;
  userMessage: string;
  variables: Record<string, unknown>;
  conversationId?: string;
}): Promise<{
  reply: string;
  nextNodeId: string | null;
  currentNodeId: string | null;
  reason: string;
}> {
  const systemPrompt = await buildFlowSystemPrompt({
    settings: input.settings,
    globalNodes: input.globalNodes,
    nodes: input.nodes,
    variables: input.variables,
    tenantId: input.tenantId,
    userMessage: input.userMessage,
  });

  const catalog = input.nodes
    .filter((n) => n.type === "conversa" && !parseConversaNodeConfig(n.config).isGlobal)
    .map((n) => n.id)
    .join(", ");

  const prompt = [
    "Modo flexível: decida a resposta ao cliente e o próximo nodeId.",
    `Node atual (se houver): ${input.currentNodeId || "início"}`,
    `Nodes conversa disponíveis: ${catalog || "(nenhum)"}`,
    `Mensagem do cliente: ${input.userMessage}`,
    'Responda APENAS JSON: {"reply":"<texto ao cliente>","nextNodeId":"<uuid ou vazio>","reason":"<motivo>"}.',
    "Se encerrar etapa, use nextNodeId vazio.",
  ].join("\n");

  const ai = await generateFlowAiReply({
    tenantId: input.tenantId,
    personaId: input.personaId,
    systemPrompt,
    userMessage: prompt,
    conversationId: input.conversationId,
  });

  const parsed = parseJsonFromAiText(ai.text);
  const reply =
    typeof parsed?.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : ai.text;
  const nextNodeId =
    typeof parsed?.nextNodeId === "string" && parsed.nextNodeId.trim()
      ? parsed.nextNodeId.trim()
      : null;
  const reason = typeof parsed?.reason === "string" ? parsed.reason.trim() : "";

  return {
    reply,
    nextNodeId,
    currentNodeId: nextNodeId,
    reason,
  };
}
