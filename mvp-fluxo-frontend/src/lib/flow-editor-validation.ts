import { isFlowVariableRef } from "./flow-variable-ref";

type FlowNodeLike = {
  id: string;
  type?: string;
  data?: {
    label?: string;
    type?: string;
    config?: Record<string, unknown>;
  };
};

const TERMINAL_TYPES = new Set(["encerramento"]);
const STOP_FLOW_TYPES = new Set(["transferir_agente"]);

function nodeType(node: FlowNodeLike): string {
  return String(node.data?.type || node.type || "");
}

function nodeName(node: FlowNodeLike): string {
  return String(node.data?.label || nodeType(node) || node.id);
}

function cfg(node: FlowNodeLike): Record<string, unknown> {
  return (node.data?.config as Record<string, unknown>) || {};
}

function isVariableRef(value: unknown): boolean {
  return typeof value === "string" && isFlowVariableRef(value);
}

function isGlobalConversaNode(config: Record<string, unknown>): boolean {
  return config.isGlobal === true || config.is_global === true;
}

function hasConversaTransitionOut(config: Record<string, unknown>): boolean {
  const transitions = Array.isArray(config.transitions) ? config.transitions : [];
  return transitions.some(
    (t) =>
      typeof (t as { next_node_id?: string }).next_node_id === "string" &&
      Boolean((t as { next_node_id: string }).next_node_id)
  );
}

function registerConversaOutgoing(nodeId: string, config: Record<string, unknown>, edgeSources: Set<string>) {
  if (hasConversaTransitionOut(config)) edgeSources.add(nodeId);
  if (typeof config.default_next_node_id === "string" && config.default_next_node_id) {
    edgeSources.add(nodeId);
  }
}

function hasOutgoingConnection(node: FlowNodeLike, edgeSources: Set<string>): boolean {
  const type = nodeType(node);
  const config = cfg(node);

  if (TERMINAL_TYPES.has(type)) return true;
  if (STOP_FLOW_TYPES.has(type)) return true;

  if (type === "conversa") {
    if (isGlobalConversaNode(config)) return true;
    if (hasConversaTransitionOut(config)) return true;
  }

  if (type === "decisao") {
    const mode = String(config.decisionMode || "simple");
    if (mode === "multi_branch") {
      const rules = Array.isArray(config.routeRules) ? config.routeRules : [];
      if (rules.some((r) => typeof (r as { next_node_id?: string }).next_node_id === "string")) {
        return true;
      }
    }
    if (mode === "ai") {
      const routes = Array.isArray(config.aiRoutes) ? config.aiRoutes : [];
      if (routes.some((r) => typeof (r as { next_node_id?: string }).next_node_id === "string")) {
        return true;
      }
      if (typeof config.default_next_node_id === "string" && config.default_next_node_id) {
        return true;
      }
    }
    return Boolean(
      (typeof config.next_node_id_true === "string" && config.next_node_id_true) ||
        (typeof config.next_node_id_false === "string" && config.next_node_id_false)
    );
  }

  if (type === "contador") {
    return Boolean(
      (typeof config.next_node_id_within === "string" && config.next_node_id_within) ||
        (typeof config.next_node_id_exceeded === "string" && config.next_node_id_exceeded)
    );
  }

  if (typeof config.next_node_id === "string" && config.next_node_id) return true;
  if (typeof config.default_next_node_id === "string" && config.default_next_node_id) return true;

  return edgeSources.has(node.id);
}

export type FlowEditorWarning = {
  nodeId: string;
  nodeName: string;
  message: string;
};

export function collectFlowEditorWarnings(nodes: FlowNodeLike[]): FlowEditorWarning[] {
  const warnings: FlowEditorWarning[] = [];
  const edgeSources = new Set<string>();

  for (const node of nodes) {
    const config = cfg(node);
    const type = nodeType(node);

    if (type === "decisao") {
      if (typeof config.next_node_id === "string" && config.next_node_id) {
        edgeSources.add(node.id);
      }
      if (typeof config.next_node_id_true === "string" && config.next_node_id_true) {
        edgeSources.add(node.id);
      }
      if (typeof config.next_node_id_false === "string" && config.next_node_id_false) {
        edgeSources.add(node.id);
      }
      const routes = Array.isArray(config.routeRules) ? config.routeRules : [];
      for (const route of routes) {
        if (typeof (route as { next_node_id?: string }).next_node_id === "string") {
          edgeSources.add(node.id);
        }
      }
      const aiRoutes = Array.isArray(config.aiRoutes) ? config.aiRoutes : [];
      for (const route of aiRoutes) {
        if (typeof (route as { next_node_id?: string }).next_node_id === "string") {
          edgeSources.add(node.id);
        }
      }
    } else if (type === "conversa") {
      registerConversaOutgoing(node.id, config, edgeSources);
    } else if (typeof config.next_node_id === "string" && config.next_node_id) {
      edgeSources.add(node.id);
    } else if (type === "contador") {
      if (config.next_node_id_within || config.next_node_id_exceeded) edgeSources.add(node.id);
    }
  }

  for (const node of nodes) {
    const type = nodeType(node);
    const config = cfg(node);
    const name = nodeName(node);

    if (!hasOutgoingConnection(node, edgeSources) && !TERMINAL_TYPES.has(type)) {
      warnings.push({
        nodeId: node.id,
        nodeName: name,
        message: "Sem conexão de saída salva (próximo node). O fluxo pode encerrar aqui no teste.",
      });
    }

    if (type === "mensagem") {
      const buttons = Array.isArray(config.buttons) ? config.buttons : [];
      const listItems = Array.isArray(config.listItems) ? config.listItems : [];
      const interactive =
        config.interactive_type === "buttons" ||
        config.interactive_type === "list" ||
        config.interactiveType === "buttons" ||
        config.interactiveType === "list" ||
        buttons.length > 0 ||
        listItems.length > 0;
      if (interactive && !hasOutgoingConnection(node, edgeSources)) {
        warnings.push({
          nodeId: node.id,
          nodeName: name,
          message:
            "Mensagem com botões/lista precisa de saída para o próximo node. No simulador, a resposta só segue após o clique.",
        });
      }
    }

    if (type === "decisao") {
      const mode = String(config.decisionMode || "simple");
      if (mode === "simple" || mode === "combined") {
        const variable = config.variable;
        if (typeof variable === "string" && variable.trim() && !isVariableRef(variable)) {
          warnings.push({
            nodeId: node.id,
            nodeName: name,
            message: `Variável "${variable}" não usa {{nome}} — a decisão não lê respostas do cliente. Use ex.: {{mensagem_recebida}}.`,
          });
        }
      }
      if (mode === "combined") {
        const rules = Array.isArray(config.rules) ? config.rules : [];
        for (const rule of rules) {
          const variable = (rule as { variable?: string }).variable;
          if (typeof variable === "string" && variable.trim() && !isVariableRef(variable)) {
            warnings.push({
              nodeId: node.id,
              nodeName: name,
              message: `Regra com variável "${variable}" sem {{nome}} — não reflete dados do atendimento.`,
            });
          }
        }
      }
      if (mode === "multi_branch") {
        const rules = Array.isArray(config.routeRules) ? config.routeRules : [];
        for (const rule of rules) {
          const variable = (rule as { variable?: string }).variable;
          if (typeof variable === "string" && variable.trim() && !isVariableRef(variable)) {
            warnings.push({
              nodeId: node.id,
              nodeName: name,
              message: `Rota "${(rule as { label?: string }).label || "?"}" usa variável fixa "${variable}". Prefira {{variavel}}.`,
            });
          }
        }
      }
    }
  }

  return warnings;
}
