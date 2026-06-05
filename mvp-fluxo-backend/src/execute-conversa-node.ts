import { ApiError, ERROR_CODES } from "./http";
import {
  applyFlowGuardrails,
  buildFlowSystemPrompt,
  generateFlowAiReply,
  loadFlowAiContext,
  resolveConversaTransition,
  resolveFlexibleStep,
} from "./flow-ai-runtime";
import { loadConversationHistoryForAi } from "./agent-conversations";
import { parseConversaNodeConfig } from "./flow-conversa-node";

type FlowNodeLite = {
  id: string;
  type: string;
  name: string;
  config: unknown;
};

export type ExecuteConversaInput = {
  tenantId: string;
  flowId: string;
  currentNode: FlowNodeLite;
  nodes: FlowNodeLite[];
  variables: Record<string, unknown>;
  userInput?: string | string[];
  /** Após transição automática entre nodes Conversa, não reutilizar last_user_message. */
  freshStage?: boolean;
  conversationId?: string;
  resolveTemplate: (text: string) => string;
};

export type ExecuteConversaResult = {
  message: string | null;
  nextNodeId: string | null;
  awaitingInput: boolean;
  details: Record<string, unknown>;
};

function userMessageFromInput(
  userInput: string | string[] | undefined,
  variables: Record<string, unknown>,
  freshStage?: boolean
): string {
  if (typeof userInput === "string" && userInput.trim()) return userInput.trim();
  if (Array.isArray(userInput) && userInput.length) {
    return userInput.map(String).join(", ");
  }
  if (freshStage) return "";
  const fromVar = variables.last_user_message ?? variables.user_message;
  if (typeof fromVar === "string" && fromVar.trim()) return fromVar.trim();
  return "";
}

export async function executeConversaNode(
  input: ExecuteConversaInput
): Promise<ExecuteConversaResult> {
  const parsed = parseConversaNodeConfig(input.currentNode.config);
  const { settings, globalNodes } = await loadFlowAiContext({
    flowId: input.flowId,
    tenantId: input.tenantId,
    nodes: input.nodes,
  });

  const personaId = parsed.personaId || settings.personaId;
  if (!personaId) {
    throw new ApiError(
      400,
      ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
      "Node Conversa sem persona: configure no nó ou em Configurações do fluxo"
    );
  }

  const userMsg = userMessageFromInput(
    input.userInput,
    input.variables,
    input.freshStage
  );
  const chatHistory =
    input.conversationId && userMsg
      ? await loadConversationHistoryForAi({
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          limit: 12,
        })
      : [];

  if (settings.executionMode === "flexible") {
    if (!userMsg) {
      const flex = await resolveFlexibleStep({
        tenantId: input.tenantId,
        personaId,
        settings,
        nodes: input.nodes,
        globalNodes,
        currentNodeId: input.currentNode.id,
        userMessage: "Inicie o atendimento com saudação adequada à etapa atual.",
        variables: input.variables,
        conversationId: input.conversationId,
      });
      const guarded = await applyFlowGuardrails({
        tenantId: input.tenantId,
        settings,
        text: flex.reply,
      });
      if (guarded.blocked) {
        throw new ApiError(
          422,
          ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
          "Resposta bloqueada por guardrails",
          { violations: guarded.violations }
        );
      }
      return {
        message: input.resolveTemplate(guarded.text),
        nextNodeId: flex.nextNodeId,
        awaitingInput: !flex.nextNodeId,
        details: {
          executionMode: "flexible",
          aiReason: flex.reason,
          guardrailViolations: guarded.violations,
        },
      };
    }

    const flex = await resolveFlexibleStep({
      tenantId: input.tenantId,
      personaId,
      settings,
      nodes: input.nodes,
      globalNodes,
      currentNodeId: input.currentNode.id,
      userMessage: userMsg,
      variables: input.variables,
      conversationId: input.conversationId,
    });
    const guarded = await applyFlowGuardrails({
      tenantId: input.tenantId,
      settings,
      text: flex.reply,
    });
    return {
      message: input.resolveTemplate(guarded.text),
      nextNodeId: flex.nextNodeId ?? parsed.defaultNextNodeId,
      awaitingInput: !(flex.nextNodeId ?? parsed.defaultNextNodeId),
      details: {
        executionMode: "flexible",
        aiReason: flex.reason,
        guardrailViolations: guarded.violations,
      },
    };
  }

  if (parsed.contentMode === "static" && !userMsg) {
    const staticText = input.resolveTemplate(parsed.staticSpeech);
    return {
      message: staticText || null,
      nextNodeId: parsed.defaultNextNodeId,
      awaitingInput: true,
      details: { contentMode: "static", awaitingUser: true },
    };
  }

  if (!userMsg) {
    const systemPrompt = await buildFlowSystemPrompt({
      settings,
      globalNodes,
      nodeConfig: parsed,
      nodeName: input.currentNode.name,
      nodes: input.nodes,
      variables: input.variables,
      tenantId: input.tenantId,
    });
    const instruction = [
      "Gere a mensagem ao cliente para esta etapa (primeira fala da etapa).",
      "Responda apenas com o texto da mensagem, sem JSON.",
    ].join("\n");
    const ai = await generateFlowAiReply({
      tenantId: input.tenantId,
      personaId,
      systemPrompt,
      userMessage: instruction,
      conversationId: input.conversationId,
    });
    const guarded = await applyFlowGuardrails({
      tenantId: input.tenantId,
      settings,
      text: ai.text,
    });
    return {
      message: input.resolveTemplate(guarded.text),
      nextNodeId: null,
      awaitingInput: true,
      details: {
        executionMode: "rigid",
        contentMode: parsed.contentMode,
        provider: ai.provider,
        model: ai.model,
        guardrailViolations: guarded.violations,
      },
    };
  }

  const transition = await resolveConversaTransition({
    tenantId: input.tenantId,
    personaId,
    settings,
    transitions: parsed.transitions,
    defaultNextNodeId: parsed.defaultNextNodeId,
    userMessage: userMsg,
    variables: input.variables,
    conversationId: input.conversationId,
  });

  const transitionTarget = transition.nextNodeId
    ? input.nodes.find((n) => n.id === transition.nextNodeId)
    : undefined;
  const deferReplyToConversaTarget =
    Boolean(transition.transitionId) &&
    transition.nextNodeId !== null &&
    transition.nextNodeId !== input.currentNode.id &&
    transitionTarget?.type === "conversa";

  if (deferReplyToConversaTarget) {
    return {
      message: null,
      nextNodeId: transition.nextNodeId,
      awaitingInput: false,
      details: {
        executionMode: "rigid",
        transitionId: transition.transitionId,
        transitionReason: transition.reason,
        deferredReply: true,
      },
    };
  }

  const systemPrompt = await buildFlowSystemPrompt({
    settings,
    globalNodes,
    nodeConfig: parsed,
    nodeName: input.currentNode.name,
    variables: input.variables,
    tenantId: input.tenantId,
    userMessage: userMsg,
  });

  const replyInstruction = [
    "Com base na etapa atual e no histórico, responda ao cliente de forma breve, clara e amigável.",
    `Mensagem atual do cliente: ${userMsg}`,
    "Não repita saudações ou parágrafos já enviados. Responda especificamente ao que foi perguntado.",
    "Responda apenas com o texto da mensagem (sem JSON, sem aspas extras).",
  ].join("\n");

  const ai = await generateFlowAiReply({
    tenantId: input.tenantId,
    personaId,
    systemPrompt,
    userMessage: replyInstruction,
    conversationId: input.conversationId,
    history: chatHistory,
  });

  const guarded = await applyFlowGuardrails({
    tenantId: input.tenantId,
    settings,
    text: ai.text,
  });

  return {
    message: input.resolveTemplate(guarded.text),
    nextNodeId: transition.nextNodeId,
    awaitingInput: !transition.nextNodeId,
    details: {
      executionMode: "rigid",
      transitionId: transition.transitionId,
      transitionReason: transition.reason,
      provider: ai.provider,
      model: ai.model,
      guardrailViolations: guarded.violations,
    },
  };
}
