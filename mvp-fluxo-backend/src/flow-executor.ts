import {
  buildCapturarEntradaAwaiting,
  formatCapturarEntradaPrompt,
  parseCapturarEntradaConfig,
  resolveCapturarEntradaInput,
  type CapturarEntradaAwaiting,
} from "./capturar-entrada";
import { applyFlowAgentHandoff } from "./agent-conversations";
import { clearInboundFlowSessionForPhone } from "./inbound-flow-session";
import {
  executeMensagemNode,
  parseMensagemNodeConfig,
  type FlowOutboundMessage,
} from "./mensagem-outbound";
import { executeContadorPassagensNode } from "./contador-passagens";
import { executeEncerramentoNode } from "./encerramento";
import { ensureConversationProtocol } from "./conversation-protocol";
import { pool } from "./db";
import {
  toCapturarEntradaConfigFromReceber,
  parseReceberMensagemConfig,
} from "./receber-mensagem";
import { executeTransferirAgenteNode } from "./transferir-agente";
import { recordFlowResponseEvent } from "./flow-response-events";
import { ApiError, ERROR_CODES } from "./http";
import { generateAiText } from "./ai";
import { executeConversaNode } from "./execute-conversa-node";
import { buildConversaAwaiting } from "./flow-conversa-node";
import { parseJsonFromModel } from "./flow-executor-utils";
import { listNodesByFlow } from "./nodes";
import { executeTabulacaoNode, parseTabulacaoNodeConfig } from "./tabulacao-node";
import {
  applyResponseTimeoutVariables,
  isWaitTimeoutElapsed,
  parseFlowWaitTimeoutConfig,
  sleepMs,
} from "./flow-wait-timeout";
import {
  cancelFlowWaitSchedule,
  scheduleFlowWaitTimeout,
} from "./flow-wait-scheduler";
import { validateFlowField } from "./flow-field-validators";
import { buildFoxCadastroFormBody } from "./fox-form-mapper";

type FlowNode = {
  id: string;
  flow_id: string;
  type: string;
  name: string;
  config: unknown;
  is_start: boolean;
};

type FlowConfig = Record<string, unknown>;

export type ExecuteFlowInput = {
  variables?: Record<string, unknown>;
  startNodeId?: string;
  maxSteps?: number;
  /** Resposta do usuário ao node capturar_entrada em execução */
  userInput?: string | string[];
  /** ISO — início da espera (para checar timeout na retomada) */
  awaitingStartedAt?: string;
  /** `timeout` = seguir pelo ramo de tempo esgotado (sem userInput) */
  resumeReason?: "timeout" | "input";
  conversationId?: string;
  phone?: string;
  sessionId?: string;
  /** Grava evento analítico (default: true) */
  persistResponses?: boolean;
};

type ExecutionTraceEntry = {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  nextNodeId: string | null;
  details?: Record<string, unknown>;
};

export type ExecuteFlowResult = {
  flowId: string;
  status: "completed" | "stopped" | "awaiting_input";
  stopReason?: string;
  visitedNodeIds: string[];
  currentNodeId: string | null;
  messages: string[];
  /** Mensagens estruturadas (texto ou botões) para envio em canais como WhatsApp */
  outboundMessages?: FlowOutboundMessage[];
  variables: Record<string, unknown>;
  trace: ExecutionTraceEntry[];
  awaitingInput?: CapturarEntradaAwaiting;
  lastResponseEventId?: string;
  /** Protocolo de encerramento deve ser enviado após outbound do fluxo */
  deferConversationClosure?: {
    conversationId: string;
    tabulacaoLabel?: string;
  };
};

function asObject(value: unknown): FlowConfig {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as FlowConfig;
  }
  return {};
}

function pickPath(source: unknown, path: string): unknown {
  const keys = path.split(".");
  let cursor: unknown = source;
  for (const key of keys) {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function resolveTemplate(text: string, variables: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    const v = variables[varName];
    return v === undefined || v === null ? `{{${varName}}}` : String(v);
  });
}

function unwrapVariableRef(raw: string): string {
  const match = raw.trim().match(/^\{\{(\w+)\}\}$/);
  return match ? match[1] : raw.trim();
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function compareValues(leftRaw: unknown, operator: string, rightRaw: unknown): boolean {
  const left = leftRaw ?? "";
  const right = rightRaw ?? "";

  if (operator === "contem") {
    return String(left).includes(String(right));
  }
  if (operator === "nao_contem") {
    return !String(left).includes(String(right));
  }
  if (operator === "igual_a") {
    return String(left) === String(right);
  }
  if (operator === "diferente_de") {
    return String(left) !== String(right);
  }

  // Numeric/time comparison
  if (operator === "maior_que" || operator === "menor_que") {
    const leftTime = parseTimeToMinutes(String(left));
    const rightTime = parseTimeToMinutes(String(right));
    if (leftTime !== null && rightTime !== null) {
      return operator === "maior_que" ? leftTime > rightTime : leftTime < rightTime;
    }

    const leftNum = Number(left);
    const rightNum = Number(right);
    const bothNumeric = Number.isFinite(leftNum) && Number.isFinite(rightNum);
    if (bothNumeric) {
      return operator === "maior_que" ? leftNum > rightNum : leftNum < rightNum;
    }

    return operator === "maior_que"
      ? String(left) > String(right)
      : String(left) < String(right);
  }

  return false;
}

type DecisionRule = {
  variable?: string;
  operator?: string;
  comparisonValue?: unknown;
};

type DecisionRouteRule = DecisionRule & {
  label?: string;
  next_node_id?: string;
};

function evaluateDecisionRule(
  rule: DecisionRule,
  variables: Record<string, unknown>
): {
  result: boolean;
  variableName: string;
  leftValue: unknown;
  operator: string;
  comparisonValue: unknown;
} {
  const variableRef = typeof rule.variable === "string" ? rule.variable : "";
  const variableName = unwrapVariableRef(variableRef);
  const operator =
    typeof rule.operator === "string" && rule.operator.trim() ? rule.operator : "igual_a";
  const comparisonValue =
    typeof rule.comparisonValue === "string" || typeof rule.comparisonValue === "number"
      ? rule.comparisonValue
      : "";
  const leftValue = variables[variableName];
  const result = compareValues(leftValue, operator, comparisonValue);
  return { result, variableName, leftValue, operator, comparisonValue };
}


async function executeApiCallNode(
  config: FlowConfig,
  variables: Record<string, unknown>
): Promise<{ nextNodeId: string | null; details: Record<string, unknown> }> {
  const rawUrl = typeof config.url === "string" ? config.url : "";
  if (!rawUrl) {
    throw new ApiError(
      400,
      ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
      "Node de chamada_api sem URL configurada"
    );
  }

  let url = resolveTemplate(rawUrl, variables);
  const queryParams = asObject(config.queryParams);
  if (Object.keys(queryParams).length > 0) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams)) {
      if (v === undefined || v === null) continue;
      sp.set(k, resolveTemplate(String(v), variables));
    }
    const queryString = sp.toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  const payloadPreset =
    typeof config.payloadPreset === "string" ? config.payloadPreset.trim() : "";
  const bodyEncoding =
    typeof config.bodyEncoding === "string" ? config.bodyEncoding.trim() : "json";

  const headers: Record<string, string> = {
    "Content-Type":
      bodyEncoding === "form" || payloadPreset === "fox_cadastro_pf"
        ? "application/x-www-form-urlencoded"
        : "application/json",
  };
  const customHeaders = asObject(config.headers);
  for (const [k, v] of Object.entries(customHeaders)) {
    if (v !== undefined && v !== null) {
      headers[k] = resolveTemplate(String(v), variables);
    }
  }

  const authType = typeof config.authType === "string" ? config.authType : "none";
  if (authType === "bearer" && typeof config.bearerToken === "string") {
    headers.Authorization = `Bearer ${resolveTemplate(config.bearerToken, variables)}`;
  }
  if (
    authType === "basic" &&
    typeof config.basicUser === "string" &&
    typeof config.basicPassword === "string"
  ) {
    const encoded = Buffer.from(
      `${resolveTemplate(config.basicUser, variables)}:${resolveTemplate(
        config.basicPassword,
        variables
      )}`
    ).toString("base64");
    headers.Authorization = `Basic ${encoded}`;
  }
  if (
    authType === "api_key" &&
    typeof config.apiKeyName === "string" &&
    typeof config.apiKeyValue === "string"
  ) {
    headers[config.apiKeyName] = resolveTemplate(config.apiKeyValue, variables);
  }

  const method =
    typeof config.method === "string" && config.method.trim()
      ? config.method.trim().toUpperCase()
      : "GET";

  const timeoutMs =
    typeof config.timeoutMs === "number" && config.timeoutMs > 0
      ? config.timeoutMs
      : 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const bodyAllowed = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    const bodyRaw = config.body;
    let body: string | undefined;
    if (bodyAllowed) {
      if (payloadPreset === "fox_cadastro_pf") {
        const hidChave =
          typeof config.foxHidChave === "string" && config.foxHidChave.trim()
            ? config.foxHidChave.trim()
            : "1671438126a22f39582f7c";
        const hidFormulario = String(
          variables.fox_hid_formulario ?? variables.hid_formulario ?? config.foxHidFormulario ?? ""
        );
        body = buildFoxCadastroFormBody(variables, hidChave, hidFormulario).toString();
      } else if (bodyEncoding === "form" && bodyRaw !== undefined) {
        const formObj = asObject(bodyRaw);
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(formObj)) {
          if (v === undefined || v === null) continue;
          params.set(k, resolveTemplate(String(v), variables));
        }
        body = params.toString();
      } else if (bodyRaw !== undefined) {
        body = JSON.stringify(bodyRaw);
      }
    }
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new ApiError(
        502,
        ERROR_CODES.execution.FLOW_EXECUTION_API_CALL_FAILED,
        `Falha na chamada API (${response.status})`,
        { status: response.status, statusText: response.statusText, payload }
      );
    }

    const mapping = asObject(config.responseMapping);
    for (const [varName, path] of Object.entries(mapping)) {
      if (typeof path !== "string") continue;
      variables[varName] = pickPath(payload, path);
    }

    return {
      nextNodeId: typeof config.next_node_id === "string" ? config.next_node_id : null,
      details: {
        method,
        url,
        status: response.status,
        mappedKeys: Object.keys(mapping),
      },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      502,
      ERROR_CODES.execution.FLOW_EXECUTION_API_CALL_FAILED,
      "Erro ao executar node de chamada_api",
      { message: error instanceof Error ? error.message : String(error) }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function executeDecisionNode(
  config: FlowConfig,
  variables: Record<string, unknown>,
  tenantId: string
): Promise<{ nextNodeId: string | null; details: Record<string, unknown> }> {
  const decisionMode =
    typeof config.decisionMode === "string" && config.decisionMode.trim()
      ? config.decisionMode
      : "simple";

  if (decisionMode === "ai") {
    const personaId =
      typeof config.aiPersonaId === "string" && config.aiPersonaId.trim()
        ? config.aiPersonaId.trim()
        : "";
    if (!personaId) {
      throw new ApiError(
        400,
        ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
        "Node de decisão IA sem persona configurada"
      );
    }

    const aiPromptBase =
      typeof config.aiPrompt === "string" && config.aiPrompt.trim()
        ? config.aiPrompt.trim()
        : "Classifique o próximo passo mais adequado para o atendimento.";
    const aiRoutes = Array.isArray(config.aiRoutes)
      ? (config.aiRoutes as Array<{ label?: string; next_node_id?: string }>)
      : [];
    const validRoutes = aiRoutes.filter(
      (route) =>
        typeof route.label === "string" &&
        route.label.trim() &&
        typeof route.next_node_id === "string" &&
        route.next_node_id.trim()
    ) as Array<{ label: string; next_node_id: string }>;

    const contextKeys = Array.isArray(config.aiContextKeys)
      ? (config.aiContextKeys as unknown[]).filter((k) => typeof k === "string")
      : [];
    const scopedVariables =
      contextKeys.length > 0
        ? Object.fromEntries(
            contextKeys
              .map((key) => [key as string, variables[key as string]])
              .filter(([, value]) => value !== undefined)
          )
        : variables;

    const instruction = [
      aiPromptBase,
      `Rotas válidas: ${validRoutes.map((r) => r.label).join(", ") || "true, false"}.`,
      `Responda APENAS em JSON no formato {"route":"<rota>","reason":"<motivo>"}.`,
      `Contexto do fluxo: ${JSON.stringify(scopedVariables)}`,
    ].join("\n");

    const ai = await generateAiText({
      tenantId,
      personaId,
      message: instruction,
    });
    const parsed = parseJsonFromModel(ai.text);
    const route = typeof parsed?.route === "string" ? parsed.route.trim() : "";
    const reason = typeof parsed?.reason === "string" ? parsed.reason.trim() : ai.text;

    const mapped = validRoutes.find((candidate) => candidate.label === route);
    let nextNodeId = mapped?.next_node_id ?? null;
    if (!nextNodeId) {
      const lowered = ai.text.toLowerCase();
      if (/\btrue\b|\bsim\b|\baprovar\b/.test(lowered)) {
        nextNodeId = typeof config.next_node_id_true === "string" ? config.next_node_id_true : null;
      } else if (/\bfalse\b|\bn[aã]o\b|\brejeitar\b/.test(lowered)) {
        nextNodeId = typeof config.next_node_id_false === "string" ? config.next_node_id_false : null;
      }
    }
    if (!nextNodeId && typeof config.default_next_node_id === "string") {
      nextNodeId = config.default_next_node_id;
    }

    return {
      nextNodeId,
      details: {
        decisionMode,
        aiRoute: route || null,
        aiReason: reason,
        availableRoutes: validRoutes.map((r) => r.label),
        provider: ai.provider,
        model: ai.model,
      },
    };
  }

  if (decisionMode === "multi_branch") {
    const routeRules = Array.isArray(config.routeRules) ? (config.routeRules as DecisionRouteRule[]) : [];
    const evaluations = routeRules
      .filter((rule) => typeof rule.next_node_id === "string" && rule.next_node_id)
      .map((rule) => ({ rule, evalResult: evaluateDecisionRule(rule, variables) }));
    const matched = evaluations.find((item) => item.evalResult.result);
    const nextNodeId = matched?.rule.next_node_id ?? (typeof config.default_next_node_id === "string" ? config.default_next_node_id : null);

    return {
      nextNodeId,
      details: {
        decisionMode,
        matchedLabel: matched?.rule.label ?? null,
        evaluations: evaluations.map((item) => ({
          label: item.rule.label ?? null,
          variableName: item.evalResult.variableName,
          operator: item.evalResult.operator,
          comparisonValue: item.evalResult.comparisonValue,
          result: item.evalResult.result,
        })),
      },
    };
  }

  const combinedRules = Array.isArray(config.rules) ? (config.rules as DecisionRule[]) : [];
  const rules =
    combinedRules.length > 0
      ? combinedRules
      : [
          {
            variable: typeof config.variable === "string" ? config.variable : "",
            operator: typeof config.operator === "string" ? config.operator : "igual_a",
            comparisonValue: config.comparisonValue,
          },
        ];
  const evaluated = rules.map((rule) => evaluateDecisionRule(rule, variables));
  const logicalOperator =
    typeof config.logicalOperator === "string" && config.logicalOperator.toUpperCase() === "OR"
      ? "OR"
      : "AND";
  const result =
    logicalOperator === "OR"
      ? evaluated.some((item) => item.result)
      : evaluated.every((item) => item.result);
  const nextNodeId = result
    ? (config.next_node_id_true as string | undefined)
    : (config.next_node_id_false as string | undefined);

  return {
    nextNodeId: nextNodeId ?? null,
    details: {
      decisionMode: evaluated.length > 1 ? "combined" : "simple",
      logicalOperator,
      rules: evaluated,
      result,
    },
  };
}

async function executeCapturarEntradaNode(
  node: FlowNode,
  config: FlowConfig,
  variables: Record<string, unknown>,
  flowId: string,
  tenantId: string,
  input: ExecuteFlowInput
): Promise<{
  nextNodeId: string | null;
  details: Record<string, unknown>;
  awaitingInput?: CapturarEntradaAwaiting;
  lastResponseEventId?: string;
  capturedMessage?: string;
}> {
  const parsed = parseCapturarEntradaConfig(config, node.id);
  const waitTimeout = parseFlowWaitTimeoutConfig(config);
  const rendered = {
    ...parsed,
    prompt: resolveTemplate(parsed.prompt, variables),
  };
  const promptMessage = formatCapturarEntradaPrompt(rendered);
  const hasInput = input.userInput !== undefined && input.userInput !== null;
  const forceTimeout = input.resumeReason === "timeout";
  const elapsedTimeout =
    !hasInput &&
    !forceTimeout &&
    waitTimeout.waitTimeoutSeconds > 0 &&
    isWaitTimeoutElapsed(input.awaitingStartedAt, waitTimeout.waitTimeoutSeconds);

  if (hasInput && !forceTimeout) {
    await cancelFlowWaitSchedule({
      tenantId,
      flowId,
      nodeId: node.id,
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      phone: input.phone,
    });
  }

  if (forceTimeout || elapsedTimeout) {
    if (!waitTimeout.nextNodeIdOnTimeout) {
      throw new ApiError(
        400,
        ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
        "Tempo de espera esgotado, mas o node não possui saída de timeout configurada"
      );
    }
    applyResponseTimeoutVariables(variables, parsed.variableName);
    variables[parsed.variableName] = null;
    return {
      nextNodeId: waitTimeout.nextNodeIdOnTimeout,
      details: {
        timedOut: true,
        waitTimeoutSeconds: waitTimeout.waitTimeoutSeconds,
        nextNodeIdOnTimeout: waitTimeout.nextNodeIdOnTimeout,
        variableName: parsed.variableName,
        resumeReason: forceTimeout ? "timeout" : "elapsed",
      },
    };
  }

  if (!hasInput) {
    const awaiting = buildCapturarEntradaAwaiting(node.id, rendered);
    const awaitingStartedAt = new Date().toISOString();
    const timeoutAt =
      waitTimeout.waitTimeoutSeconds > 0
        ? new Date(
            Date.now() + waitTimeout.waitTimeoutSeconds * 1000
          ).toISOString()
        : undefined;
    const awaitingWithTimeout: CapturarEntradaAwaiting = {
      ...awaiting,
      awaitingStartedAt,
      waitTimeoutSeconds:
        waitTimeout.waitTimeoutSeconds > 0
          ? waitTimeout.waitTimeoutSeconds
          : undefined,
      timeoutAt,
      nextNodeIdOnTimeout: waitTimeout.nextNodeIdOnTimeout,
    };
    return {
      nextNodeId: null,
      awaitingInput: awaitingWithTimeout,
      capturedMessage: promptMessage,
      details: {
        awaitingInput: true,
        inputMode: parsed.inputMode,
        promptKey: parsed.promptKey,
        variableName: parsed.variableName,
        optionsCount: parsed.options.length,
        minSelections: parsed.minSelections,
        maxSelections: parsed.maxSelections,
        waitTimeoutSeconds: waitTimeout.waitTimeoutSeconds,
        timeoutAt,
        nextNodeIdOnTimeout: waitTimeout.nextNodeIdOnTimeout,
        awaitingStartedAt,
      },
    };
  }

  let resolved;
  try {
    resolved = resolveCapturarEntradaInput(parsed, input.userInput);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.statusCode === 400 &&
      (parsed.inputMode === "single_choice" || parsed.inputMode === "multi_choice")
    ) {
      const retryPrompt = [
        parsed.invalidPrompt ||
          "Não entendi. Por favor, digite apenas o número correspondente à sua resposta.",
        formatCapturarEntradaPrompt(rendered),
      ].join("\n\n");
      const awaiting = buildCapturarEntradaAwaiting(node.id, rendered);
      return {
        nextNodeId: null,
        awaitingInput: {
          ...awaiting,
          prompt: retryPrompt,
          awaitingStartedAt: input.awaitingStartedAt ?? new Date().toISOString(),
        },
        capturedMessage: retryPrompt,
        details: { validationFailed: true, inputMode: parsed.inputMode },
      };
    }
    throw error;
  }

  if (parsed.inputMode === "text" && parsed.validationType) {
    const rawText = Array.isArray(resolved.value)
      ? resolved.value.join(", ")
      : String(resolved.value);
    const validated = validateFlowField(
      parsed.validationType,
      rawText,
      parsed.validationOptions ?? {}
    );
    if (!validated.ok) {
      const retryPrompt = [
        parsed.invalidPrompt || validated.reason,
        rendered.prompt,
      ].join("\n\n");
      const awaiting = buildCapturarEntradaAwaiting(node.id, rendered);
      return {
        nextNodeId: null,
        awaitingInput: {
          ...awaiting,
          prompt: retryPrompt,
          awaitingStartedAt: input.awaitingStartedAt ?? new Date().toISOString(),
        },
        capturedMessage: retryPrompt,
        details: {
          validationFailed: true,
          validationType: parsed.validationType,
          reason: validated.reason,
        },
      };
    }
    variables[resolved.variableName] = validated.normalized;
    if (validated.rawAccepted) {
      variables[`${resolved.variableName}_raw`] = validated.rawAccepted;
    }
  } else {
    variables[resolved.variableName] = resolved.value;
  }
  variables[`${resolved.variableName}_labels`] = resolved.selectedOptions.map((o) => o.label);
  variables[`${resolved.variableName}_options`] = resolved.selectedOptions;

  if (parsed.snapshotToArray) {
    const fields = parsed.snapshotFields ?? {
      nome: "filho_nome",
      nascimento: "filho_nascimento",
      sexo: "filho_sexo",
    };
    const entry: Record<string, unknown> = {};
    for (const [key, varName] of Object.entries(fields)) {
      entry[key] = variables[varName];
    }
    const current = Array.isArray(variables[parsed.snapshotToArray])
      ? (variables[parsed.snapshotToArray] as unknown[])
      : [];
    variables[parsed.snapshotToArray] = [...current, entry];
    if (current.length === 0) {
      variables.filho_nome = variables[fields.nome ?? "filho_nome"];
      variables.filho_nascimento = variables[fields.nascimento ?? "filho_nascimento"];
      variables.filho_sexo = variables[fields.sexo ?? "filho_sexo"];
    }
  }

  let lastResponseEventId: string | undefined;
  const shouldPersist = input.persistResponses !== false;
  if (shouldPersist) {
    const event = await recordFlowResponseEvent({
      tenantId,
      flowId,
      nodeId: node.id,
      conversationId: input.conversationId,
      phone: input.phone,
      sessionId: input.sessionId,
      questionKey: resolved.promptKey,
      promptText: resolved.prompt,
      answerType: resolved.inputMode,
      variableName: resolved.variableName,
      selectedOptions: resolved.selectedOptions,
      rawValue: Array.isArray(resolved.value) ? resolved.value.join(",") : resolved.value,
      metadata: {
        nodeName: node.name,
        nodeType: node.type,
      },
    });
    lastResponseEventId = event.id;
  }

  return {
    nextNodeId: resolved.nextNodeId,
    lastResponseEventId,
    details: {
      captured: true,
      inputMode: resolved.inputMode,
      promptKey: resolved.promptKey,
      variableName: resolved.variableName,
      value: resolved.value,
      selectedOptions: resolved.selectedOptions,
      responseEventId: lastResponseEventId ?? null,
    },
  };
}

export async function executeFlow(
  flowId: string,
  tenantId: string,
  input: ExecuteFlowInput = {}
): Promise<ExecuteFlowResult> {
  let nodes: FlowNode[];
  try {
    nodes = (await listNodesByFlow(flowId, tenantId)) as FlowNode[];
  } catch (error) {
    if (error instanceof Error && error.message.includes("Flow not found")) {
      throw new ApiError(
        404,
        ERROR_CODES.flows.FLOW_NOT_FOUND,
        "Flow não encontrado ou não pertence a este tenant"
      );
    }
    throw error;
  }
  if (nodes.length === 0) {
    throw new ApiError(
      404,
      ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
      "Fluxo sem nodes para execução"
    );
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const variables: Record<string, unknown> = { ...(input.variables ?? {}) };
  const messages: string[] = [];
  const outboundMessages: FlowOutboundMessage[] = [];
  const trace: ExecutionTraceEntry[] = [];
  const visitedNodeIds: string[] = [];
  const maxSteps =
    typeof input.maxSteps === "number" && input.maxSteps > 0 ? input.maxSteps : 25;

  let currentNode: FlowNode | undefined =
    (input.startNodeId && nodesById.get(input.startNodeId)) ||
    nodes.find((n) => n.is_start) ||
    nodes.find((n) => n.type === "inicio") ||
    nodes[0];

  let steps = 0;
  let lastResponseEventId: string | undefined;
  let deferConversationClosure: ExecuteFlowResult["deferConversationClosure"];
  let captureInputConsumed = false;
  let flowUserInput: string | string[] | undefined = input.userInput;
  const allNodesLite = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    name: n.name,
    config: n.config,
  }));

  while (currentNode && steps < maxSteps) {
    steps += 1;
    visitedNodeIds.push(currentNode.id);
    const config = asObject(currentNode.config);

    if (flowUserInput !== undefined && !captureInputConsumed) {
      variables.last_user_message = Array.isArray(flowUserInput)
        ? flowUserInput.join(", ")
        : String(flowUserInput);
    }

    let nextNodeId: string | null = null;
    let details: Record<string, unknown> | undefined;

    if (currentNode.type === "inicio") {
      nextNodeId = typeof config.next_node_id === "string" ? config.next_node_id : null;
    } else if (currentNode.type === "mensagem") {
      const parsedMsg = parseMensagemNodeConfig(config);
      if (parsedMsg.sendDelaySeconds > 0) {
        await sleepMs(parsedMsg.sendDelaySeconds * 1000);
      }
      const msgResult = executeMensagemNode({
        config,
        variables,
        resolveTemplate: (text) => resolveTemplate(text, variables),
      });
      for (const m of msgResult.messages) {
        messages.push(m);
      }
      outboundMessages.push(...msgResult.outboundMessages);
      nextNodeId = msgResult.nextNodeId;
      details = msgResult.details;
    } else if (currentNode.type === "chamada_api") {
      const apiResult = await executeApiCallNode(config, variables);
      nextNodeId = apiResult.nextNodeId;
      details = apiResult.details;
    } else if (currentNode.type === "decisao") {
      const decisionResult = await executeDecisionNode(config, variables, tenantId);
      nextNodeId = decisionResult.nextNodeId;
      details = decisionResult.details;
    } else if (currentNode.type === "receber_mensagem") {
      const parsedReceber = parseReceberMensagemConfig(config, currentNode.id);
      const capturarConfig = toCapturarEntradaConfigFromReceber(parsedReceber);
      const syntheticNode: FlowNode = {
        ...currentNode,
        type: "capturar_entrada",
        config: capturarConfig,
      };
      const captureInput: ExecuteFlowInput = captureInputConsumed
        ? { ...input, userInput: undefined }
        : { ...input, userInput: flowUserInput };
      const captureResult = await executeCapturarEntradaNode(
        syntheticNode,
        capturarConfig,
        variables,
        flowId,
        tenantId,
        captureInput
      );
      if (!captureResult.awaitingInput && flowUserInput !== undefined) {
        captureInputConsumed = true;
        flowUserInput = undefined;
      }
      if (captureResult.capturedMessage) {
        messages.push(captureResult.capturedMessage);
      }
      if (captureResult.awaitingInput) {
        trace.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          nodeName: currentNode.name,
          nextNodeId: null,
          details: { ...captureResult.details, nodeKind: "receber_mensagem" },
        });
        const waitTimeout = parseReceberMensagemConfig(config, currentNode.id).waitTimeout;
        if (
          waitTimeout.waitTimeoutSeconds > 0 &&
          waitTimeout.nextNodeIdOnTimeout
        ) {
          await scheduleFlowWaitTimeout({
            tenantId,
            flowId,
            nodeId: currentNode.id,
            nodeType: currentNode.type,
            waitTimeoutSeconds: waitTimeout.waitTimeoutSeconds,
            nextNodeIdOnTimeout: waitTimeout.nextNodeIdOnTimeout,
            executeInput: {
              ...input,
              variables: { ...variables },
              startNodeId: currentNode.id,
              awaitingStartedAt:
                captureResult.awaitingInput.awaitingStartedAt ??
                new Date().toISOString(),
            },
          });
        }
        return {
          flowId,
          status: "awaiting_input",
          visitedNodeIds,
          currentNodeId: currentNode.id,
          messages,
          outboundMessages,
          variables,
          trace,
          awaitingInput: captureResult.awaitingInput,
        };
      }
      nextNodeId = captureResult.nextNodeId;
      details = { ...captureResult.details, nodeKind: "receber_mensagem" };
      if (captureResult.lastResponseEventId) {
        lastResponseEventId = captureResult.lastResponseEventId;
      }
    } else if (currentNode.type === "capturar_entrada") {
      const captureInput: ExecuteFlowInput = captureInputConsumed
        ? { ...input, userInput: undefined }
        : { ...input, userInput: flowUserInput };
      const captureResult = await executeCapturarEntradaNode(
        currentNode,
        config,
        variables,
        flowId,
        tenantId,
        captureInput
      );
      if (!captureResult.awaitingInput && flowUserInput !== undefined) {
        captureInputConsumed = true;
        flowUserInput = undefined;
      }
      if (captureResult.capturedMessage) {
        messages.push(captureResult.capturedMessage);
      }
      if (captureResult.awaitingInput) {
        trace.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          nodeName: currentNode.name,
          nextNodeId: null,
          details: captureResult.details,
        });
        const waitTimeout = parseFlowWaitTimeoutConfig(config);
        if (
          waitTimeout.waitTimeoutSeconds > 0 &&
          waitTimeout.nextNodeIdOnTimeout
        ) {
          await scheduleFlowWaitTimeout({
            tenantId,
            flowId,
            nodeId: currentNode.id,
            nodeType: currentNode.type,
            waitTimeoutSeconds: waitTimeout.waitTimeoutSeconds,
            nextNodeIdOnTimeout: waitTimeout.nextNodeIdOnTimeout,
            executeInput: {
              ...input,
              variables: { ...variables },
              startNodeId: currentNode.id,
              awaitingStartedAt:
                captureResult.awaitingInput.awaitingStartedAt ??
                new Date().toISOString(),
            },
          });
        }
        return {
          flowId,
          status: "awaiting_input",
          visitedNodeIds,
          currentNodeId: currentNode.id,
          messages,
          outboundMessages,
          variables,
          trace,
          awaitingInput: captureResult.awaitingInput,
        };
      }
      nextNodeId = captureResult.nextNodeId;
      details = captureResult.details;
      if (captureResult.lastResponseEventId) {
        lastResponseEventId = captureResult.lastResponseEventId;
      }
    } else if (currentNode.type === "contador") {
      const counterResult = executeContadorPassagensNode({
        config,
        nodeId: currentNode.id,
        variables,
      });
      nextNodeId = counterResult.nextNodeId;
      details = counterResult.details;
    } else if (currentNode.type === "transferir_agente") {
      let handoffApplied = false;
      if (input.conversationId) {
        handoffApplied = await applyFlowAgentHandoff({
          tenantId,
          conversationId: input.conversationId,
          queue:
            typeof config.queue === "string" && config.queue.trim()
              ? config.queue.trim()
              : "Geral",
          flowId,
          nodeId: currentNode.id,
        });
      }
      const handoffResult = executeTransferirAgenteNode({
        config,
        variables,
        handoffApplied,
      });
      if (handoffResult.message) {
        messages.push(handoffResult.message);
      }
      nextNodeId = handoffResult.nextNodeId;
      details = handoffResult.details;
      if (handoffResult.stopFlow) {
        trace.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          nodeName: currentNode.name,
          nextNodeId: null,
          details,
        });
        return {
          flowId,
          status: "completed",
          stopReason: "transferir_agente",
          visitedNodeIds,
          currentNodeId: currentNode.id,
          messages,
          outboundMessages,
          variables,
          trace,
          ...(lastResponseEventId ? { lastResponseEventId } : {}),
        };
      }
    } else if (currentNode.type === "encerramento") {
      const endResult = executeEncerramentoNode({ config, variables });
      if (endResult.message) {
        messages.push(endResult.message);
      }
      if (input.conversationId) {
        const tabLabel =
          typeof variables.tabulacao_label === "string"
            ? variables.tabulacao_label
            : typeof variables.tabulacao === "string"
              ? variables.tabulacao
              : undefined;
        await ensureConversationProtocol({
          tenantId,
          conversationId: input.conversationId,
        });
        deferConversationClosure = {
          conversationId: input.conversationId,
          tabulacaoLabel: tabLabel,
        };
        await pool.query(
          `UPDATE agent_conversations
           SET lifecycle_status = 'closed_manual',
               status = 'historico',
               closed_at = now(),
               closed_by = 'flow:encerramento',
               tabulacao_label = COALESCE($1, tabulacao_label),
               updated_at = now()
           WHERE id = $2::uuid AND tenant_id = $3::uuid`,
          [tabLabel ?? null, input.conversationId, tenantId]
        );
        if (input.phone?.trim()) {
          await clearInboundFlowSessionForPhone(tenantId, input.phone);
        }
      }
      trace.push({
        nodeId: currentNode.id,
        nodeType: currentNode.type,
        nodeName: currentNode.name,
        nextNodeId: null,
        details: endResult.details,
      });
      return {
        flowId,
        status: "completed",
        stopReason: "encerramento",
        visitedNodeIds,
        currentNodeId: currentNode.id,
        messages,
        outboundMessages,
        variables,
        trace,
        ...(deferConversationClosure ? { deferConversationClosure } : {}),
        ...(lastResponseEventId ? { lastResponseEventId } : {}),
      };
    } else if (currentNode.type === "conversa") {
      const conversaInput: ExecuteFlowInput = captureInputConsumed
        ? { ...input, userInput: undefined }
        : { ...input, userInput: flowUserInput };
      if (!captureInputConsumed && flowUserInput !== undefined) {
        captureInputConsumed = true;
      }
      const conversaFreshStage =
        captureInputConsumed && flowUserInput === undefined;
      const conversaResult = await executeConversaNode({
        tenantId,
        flowId,
        currentNode: {
          id: currentNode.id,
          type: currentNode.type,
          name: currentNode.name,
          config: currentNode.config,
        },
        nodes: allNodesLite,
        variables,
        userInput: conversaInput.userInput,
        freshStage: conversaFreshStage,
        conversationId: input.conversationId,
        resolveTemplate: (text) => resolveTemplate(text, variables),
      });
      if (conversaResult.message) {
        messages.push(conversaResult.message);
        outboundMessages.push({ kind: "text", body: conversaResult.message });
      }

      if (conversaResult.nextNodeId) {
        const deferredToConversa = conversaResult.details?.deferredReply === true;
        if (deferredToConversa) {
          captureInputConsumed = false;
        } else {
          flowUserInput = undefined;
          delete variables.last_user_message;
          delete variables.user_message;
        }
        nextNodeId = conversaResult.nextNodeId;
        details = conversaResult.details;
        trace.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          nodeName: currentNode.name,
          nextNodeId,
          details,
        });
        currentNode = nodesById.get(nextNodeId);
        if (!currentNode) {
          return {
            flowId,
            status: "stopped",
            stopReason: `Próximo node não encontrado: ${nextNodeId}`,
            visitedNodeIds,
            currentNodeId: null,
            messages,
            outboundMessages,
            variables,
            trace,
            ...(lastResponseEventId ? { lastResponseEventId } : {}),
          };
        }
        continue;
      }

      if (conversaResult.message) {
        trace.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          nodeName: currentNode.name,
          nextNodeId: null,
          details: conversaResult.details,
        });
        return {
          flowId,
          status: "awaiting_input",
          visitedNodeIds,
          currentNodeId: currentNode.id,
          messages,
          outboundMessages,
          variables,
          trace,
          awaitingInput: buildConversaAwaiting({
            nodeId: currentNode.id,
            prompt: conversaResult.message,
          }),
        };
      }
      if (conversaResult.awaitingInput) {
        trace.push({
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          nodeName: currentNode.name,
          nextNodeId: null,
          details: conversaResult.details,
        });
        return {
          flowId,
          status: "awaiting_input",
          visitedNodeIds,
          currentNodeId: currentNode.id,
          messages,
          outboundMessages,
          variables,
          trace,
          awaitingInput: buildConversaAwaiting({
            nodeId: currentNode.id,
            prompt: "Aguardando resposta do cliente.",
          }),
        };
      }
      nextNodeId = conversaResult.nextNodeId;
      details = conversaResult.details;
    } else if (currentNode.type === "tabulacao") {
      const tabResult = executeTabulacaoNode({ config, variables });
      const parsedTab = parseTabulacaoNodeConfig(config);
      nextNodeId = tabResult.nextNodeId;
      details = tabResult.details;
      if (input.persistResponses !== false) {
        const event = await recordFlowResponseEvent({
          tenantId,
          flowId,
          nodeId: currentNode.id,
          conversationId: input.conversationId,
          phone: input.phone,
          sessionId: input.sessionId,
          questionKey: parsedTab.questionKey,
          promptText: "Tabulação de atendimento",
          answerType: "single_choice",
          variableName: parsedTab.variableName,
          selectedOptions: [tabResult.selectedOption],
          rawValue: tabResult.selectedOption.id,
          metadata: {
            nodeName: currentNode.name,
            nodeType: currentNode.type,
            tabulacaoId: parsedTab.tabulacaoId,
          },
        });
        lastResponseEventId = event.id;
      }
    } else {
      nextNodeId = typeof config.next_node_id === "string" ? config.next_node_id : null;
    }

    trace.push({
      nodeId: currentNode.id,
      nodeType: currentNode.type,
      nodeName: currentNode.name,
      nextNodeId,
      details,
    });

    if (!nextNodeId) {
      return {
        flowId,
        status: "completed",
        visitedNodeIds,
        currentNodeId: currentNode.id,
        messages,
        outboundMessages,
        variables,
        trace,
        ...(lastResponseEventId ? { lastResponseEventId } : {}),
      };
    }

    currentNode = nodesById.get(nextNodeId);
    if (!currentNode) {
      return {
        flowId,
        status: "stopped",
        stopReason: `Próximo node não encontrado: ${nextNodeId}`,
        visitedNodeIds,
        currentNodeId: null,
        messages,
        outboundMessages,
        variables,
        trace,
        ...(lastResponseEventId ? { lastResponseEventId } : {}),
      };
    }
  }

  return {
    flowId,
    status: "stopped",
    stopReason: `Limite de passos atingido (${maxSteps})`,
    visitedNodeIds,
    currentNodeId: currentNode?.id ?? null,
    messages,
    outboundMessages,
    variables,
    trace,
    ...(lastResponseEventId ? { lastResponseEventId } : {}),
  };
}
