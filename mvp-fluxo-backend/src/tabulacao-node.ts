import type { CaptureOption } from "./capturar-entrada";

export type TabulacaoNodeConfig = {
  tabulacaoId: string | null;
  tabulacaoKey: string;
  tabulacaoLabel: string;
  variableName: string;
  questionKey: string;
  nextNodeId: string | null;
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function parseTabulacaoNodeConfig(raw: Record<string, unknown>): TabulacaoNodeConfig {
  const tabulacaoId =
    typeof raw.tabulacao_id === "string" && raw.tabulacao_id.trim()
      ? raw.tabulacao_id.trim()
      : typeof raw.tabulacaoId === "string" && raw.tabulacaoId.trim()
        ? raw.tabulacaoId.trim()
        : null;
  const tabulacaoKeyRaw =
    typeof raw.tabulacao_key === "string"
      ? raw.tabulacao_key
      : typeof raw.tabulacaoKey === "string"
        ? raw.tabulacaoKey
        : "";
  const tabulacaoKey = slugify(tabulacaoKeyRaw || "tabulacao");
  const tabulacaoLabel =
    typeof raw.tabulacao_label === "string" && raw.tabulacao_label.trim()
      ? raw.tabulacao_label.trim()
      : typeof raw.tabulacaoLabel === "string" && raw.tabulacaoLabel.trim()
        ? raw.tabulacaoLabel.trim()
        : tabulacaoKey;
  const variableName =
    typeof raw.variable_name === "string" && raw.variable_name.trim()
      ? raw.variable_name.trim()
      : typeof raw.variableName === "string" && raw.variableName.trim()
        ? raw.variableName.trim()
        : "tabulacao";
  const questionKeyRaw =
    typeof raw.question_key === "string"
      ? raw.question_key
      : typeof raw.questionKey === "string"
        ? raw.questionKey
        : "tabulacao";
  const questionKey = slugify(questionKeyRaw || "tabulacao");
  const nextNodeId =
    typeof raw.next_node_id === "string" && raw.next_node_id.trim()
      ? raw.next_node_id.trim()
      : null;
  return {
    tabulacaoId,
    tabulacaoKey,
    tabulacaoLabel,
    variableName,
    questionKey,
    nextNodeId,
  };
}

export function executeTabulacaoNode(input: {
  config: Record<string, unknown>;
  variables: Record<string, unknown>;
}): {
  nextNodeId: string | null;
  selectedOption: CaptureOption;
  details: Record<string, unknown>;
} {
  const parsed = parseTabulacaoNodeConfig(input.config);
  input.variables[parsed.variableName] = parsed.tabulacaoKey;
  input.variables[`${parsed.variableName}_label`] = parsed.tabulacaoLabel;
  input.variables.flow_tabulacao = parsed.tabulacaoKey;
  input.variables.flow_tabulacao_label = parsed.tabulacaoLabel;
  const selectedOption: CaptureOption = {
    id: parsed.tabulacaoKey,
    label: parsed.tabulacaoLabel,
  };
  return {
    nextNodeId: parsed.nextNodeId,
    selectedOption,
    details: {
      tabulacaoId: parsed.tabulacaoId,
      tabulacaoKey: parsed.tabulacaoKey,
      tabulacaoLabel: parsed.tabulacaoLabel,
      variableName: parsed.variableName,
      questionKey: parsed.questionKey,
    },
  };
}
