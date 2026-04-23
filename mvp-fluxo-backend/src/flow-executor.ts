import { ApiError, ERROR_CODES } from "./http";
import { listNodesByFlow } from "./nodes";

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
  status: "completed" | "stopped";
  stopReason?: string;
  visitedNodeIds: string[];
  currentNodeId: string | null;
  messages: string[];
  variables: Record<string, unknown>;
  trace: ExecutionTraceEntry[];
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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
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
    const body = bodyAllowed && bodyRaw !== undefined ? JSON.stringify(bodyRaw) : undefined;
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

function executeDecisionNode(
  config: FlowConfig,
  variables: Record<string, unknown>
): { nextNodeId: string | null; details: Record<string, unknown> } {
  const variableRef =
    typeof config.variable === "string" && config.variable.trim()
      ? config.variable
      : "";
  const variableName = unwrapVariableRef(variableRef);
  const operator =
    typeof config.operator === "string" && config.operator.trim()
      ? config.operator
      : "igual_a";
  const comparisonValue =
    typeof config.comparisonValue === "string" ? config.comparisonValue : "";
  const leftValue = variables[variableName];
  const result = compareValues(leftValue, operator, comparisonValue);
  const nextNodeId = result
    ? (config.next_node_id_true as string | undefined)
    : (config.next_node_id_false as string | undefined);

  return {
    nextNodeId: nextNodeId ?? null,
    details: {
      variableName,
      leftValue,
      operator,
      comparisonValue,
      result,
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
  while (currentNode && steps < maxSteps) {
    steps += 1;
    visitedNodeIds.push(currentNode.id);
    const config = asObject(currentNode.config);

    let nextNodeId: string | null = null;
    let details: Record<string, unknown> | undefined;

    if (currentNode.type === "inicio") {
      nextNodeId = typeof config.next_node_id === "string" ? config.next_node_id : null;
    } else if (currentNode.type === "mensagem") {
      const content = typeof config.content === "string" ? config.content : "";
      const rendered = resolveTemplate(content, variables);
      messages.push(rendered);
      nextNodeId = typeof config.next_node_id === "string" ? config.next_node_id : null;
      details = { renderedContent: rendered };
    } else if (currentNode.type === "chamada_api") {
      const apiResult = await executeApiCallNode(config, variables);
      nextNodeId = apiResult.nextNodeId;
      details = apiResult.details;
    } else if (currentNode.type === "decisao") {
      const decisionResult = executeDecisionNode(config, variables);
      nextNodeId = decisionResult.nextNodeId;
      details = decisionResult.details;
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
        variables,
        trace,
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
        variables,
        trace,
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
    variables,
    trace,
  };
}
