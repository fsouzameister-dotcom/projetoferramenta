import {
  buildCapturarEntradaAwaiting,
  parseCapturarEntradaConfig,
} from "./capturar-entrada";
import {
  parseFlowWaitTimeoutConfig,
  type FlowWaitTimeoutConfig,
} from "./flow-wait-timeout";

export type ReceberMensagemConfig = {
  variableName: string;
  promptKey: string;
  waitHint: string;
  nextNodeId: string | null;
  waitTimeout: FlowWaitTimeoutConfig;
};

export function parseReceberMensagemConfig(
  raw: Record<string, unknown>,
  nodeId: string
): ReceberMensagemConfig {
  const waitHint =
    typeof raw.wait_hint === "string"
      ? raw.wait_hint.trim()
      : typeof raw.waitHint === "string"
        ? raw.waitHint.trim()
        : "";
  const promptKey =
    typeof raw.prompt_key === "string" && raw.prompt_key.trim()
      ? raw.prompt_key.trim()
      : typeof raw.promptKey === "string" && raw.promptKey.trim()
        ? raw.promptKey.trim()
        : `recebimento_${nodeId.slice(0, 8)}`;
  const variableName =
    typeof raw.variableName === "string" && raw.variableName.trim()
      ? raw.variableName.trim()
      : "mensagem_recebida";
  const nextNodeId =
    typeof raw.next_node_id === "string" && raw.next_node_id.trim()
      ? raw.next_node_id.trim()
      : null;

  const waitTimeout = parseFlowWaitTimeoutConfig(raw);
  return { variableName, promptKey, waitHint, nextNodeId, waitTimeout };
}

/** Config para reutilizar capturar_entrada (modo texto) no executor. */
export function toCapturarEntradaConfigFromReceber(
  parsed: ReceberMensagemConfig
): Record<string, unknown> {
  return {
    prompt: parsed.waitHint || "Aguardando sua mensagem…",
    promptKey: parsed.promptKey,
    inputMode: "text",
    variableName: parsed.variableName,
    next_node_id: parsed.nextNodeId,
    wait_timeout_seconds: parsed.waitTimeout.waitTimeoutSeconds,
    next_node_id_on_timeout: parsed.waitTimeout.nextNodeIdOnTimeout,
    minSelections: 1,
    maxSelections: 1,
  };
}

export function parseReceberAsCapturarConfig(
  raw: Record<string, unknown>,
  nodeId: string
) {
  const receber = parseReceberMensagemConfig(raw, nodeId);
  return parseCapturarEntradaConfig(toCapturarEntradaConfigFromReceber(receber), nodeId);
}

export function buildReceberMensagemAwaiting(
  nodeId: string,
  raw: Record<string, unknown>
) {
  const capturar = parseReceberAsCapturarConfig(raw, nodeId);
  return buildCapturarEntradaAwaiting(nodeId, capturar);
}
