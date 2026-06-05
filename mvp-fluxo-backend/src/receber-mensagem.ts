import {
  buildCapturarEntradaAwaiting,
  parseCapturarEntradaConfig,
} from "./capturar-entrada";
import {
  parseFlowWaitTimeoutConfig,
  type FlowWaitTimeoutConfig,
} from "./flow-wait-timeout";

import type {
  FlowFieldValidationOptions,
  FlowFieldValidationType,
} from "./flow-field-validators";

export type ReceberMensagemConfig = {
  variableName: string;
  promptKey: string;
  waitHint: string;
  nextNodeId: string | null;
  waitTimeout: FlowWaitTimeoutConfig;
  validationType?: FlowFieldValidationType;
  validationOptions?: FlowFieldValidationOptions;
  invalidPrompt?: string;
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
  const validationType =
    typeof raw.validationType === "string"
      ? (raw.validationType as FlowFieldValidationType)
      : typeof raw.validation_type === "string"
        ? (raw.validation_type as FlowFieldValidationType)
        : undefined;
  const invalidPrompt =
    typeof raw.invalidPrompt === "string" && raw.invalidPrompt.trim()
      ? raw.invalidPrompt.trim()
      : typeof raw.invalid_prompt === "string" && raw.invalid_prompt.trim()
        ? raw.invalid_prompt.trim()
        : undefined;
  const validationOptions =
    raw.validationOptions && typeof raw.validationOptions === "object"
      ? (raw.validationOptions as FlowFieldValidationOptions)
      : raw.validation_options && typeof raw.validation_options === "object"
        ? (raw.validation_options as FlowFieldValidationOptions)
        : undefined;
  return {
    variableName,
    promptKey,
    waitHint,
    nextNodeId,
    waitTimeout,
    validationType,
    validationOptions,
    invalidPrompt,
  };
}

/** Config para reutilizar capturar_entrada (modo texto) no executor. */
export function toCapturarEntradaConfigFromReceber(
  parsed: ReceberMensagemConfig
): Record<string, unknown> {
  return {
    prompt: parsed.waitHint,
    promptKey: parsed.promptKey,
    inputMode: "text",
    variableName: parsed.variableName,
    next_node_id: parsed.nextNodeId,
    wait_timeout_seconds: parsed.waitTimeout.waitTimeoutSeconds,
    next_node_id_on_timeout: parsed.waitTimeout.nextNodeIdOnTimeout,
    minSelections: 1,
    maxSelections: 1,
    validationType: parsed.validationType,
    validationOptions: parsed.validationOptions,
    invalidPrompt: parsed.invalidPrompt,
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
