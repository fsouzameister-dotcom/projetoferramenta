import { ApiError, ERROR_CODES } from "./http";

export type CaptureInputMode = "text" | "single_choice" | "multi_choice";

export type CaptureOption = {
  id: string;
  label: string;
};

export type CapturarEntradaConfig = {
  prompt?: string;
  promptKey?: string;
  inputMode?: CaptureInputMode;
  options?: CaptureOption[];
  minSelections?: number;
  maxSelections?: number;
  variableName?: string;
  next_node_id?: string;
};

export type CapturarEntradaAwaiting = {
  nodeId: string;
  prompt: string;
  promptKey: string;
  inputMode: CaptureInputMode;
  options: CaptureOption[];
  minSelections: number;
  maxSelections: number;
  variableName: string;
};

export type CapturarEntradaResolved = {
  variableName: string;
  promptKey: string;
  prompt: string;
  inputMode: CaptureInputMode;
  value: string | string[];
  selectedOptions: CaptureOption[];
  nextNodeId: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

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

export function parseCapturarEntradaConfig(
  raw: unknown,
  nodeId: string
): CapturarEntradaConfig & {
  prompt: string;
  promptKey: string;
  inputMode: CaptureInputMode;
  options: CaptureOption[];
  minSelections: number;
  maxSelections: number;
  variableName: string;
} {
  const config = asObject(raw);
  const prompt =
    typeof config.prompt === "string" && config.prompt.trim()
      ? config.prompt.trim()
      : "Informe sua resposta:";
  const promptKey =
    typeof config.promptKey === "string" && config.promptKey.trim()
      ? slugify(config.promptKey)
      : slugify(`node_${nodeId}`);
  const inputModeRaw = typeof config.inputMode === "string" ? config.inputMode : "text";
  const inputMode: CaptureInputMode =
    inputModeRaw === "single_choice" || inputModeRaw === "multi_choice"
      ? inputModeRaw
      : "text";

  const options = Array.isArray(config.options)
    ? (config.options as unknown[])
        .map((item, index) => {
          const row = asObject(item);
          const id =
            typeof row.id === "string" && row.id.trim()
              ? row.id.trim()
              : `opt_${index + 1}`;
          const label =
            typeof row.label === "string" && row.label.trim()
              ? row.label.trim()
              : id;
          return { id, label };
        })
        .filter((opt, index, arr) => arr.findIndex((x) => x.id === opt.id) === index)
    : [];

  const minSelections =
    typeof config.minSelections === "number" && config.minSelections >= 0
      ? Math.floor(config.minSelections)
      : inputMode === "multi_choice"
        ? 1
        : 1;
  const maxSelections =
    typeof config.maxSelections === "number" && config.maxSelections > 0
      ? Math.floor(config.maxSelections)
      : inputMode === "multi_choice"
        ? 3
        : 1;
  const variableName =
    typeof config.variableName === "string" && config.variableName.trim()
      ? config.variableName.trim()
      : `resposta_${promptKey}`;

  return {
    ...config,
    prompt,
    promptKey,
    inputMode,
    options,
    minSelections,
    maxSelections: inputMode === "multi_choice" ? Math.max(maxSelections, minSelections) : 1,
    variableName,
    next_node_id:
      typeof config.next_node_id === "string" ? config.next_node_id : undefined,
  };
}

export function buildCapturarEntradaAwaiting(
  nodeId: string,
  config: ReturnType<typeof parseCapturarEntradaConfig>
): CapturarEntradaAwaiting {
  if (
    (config.inputMode === "single_choice" || config.inputMode === "multi_choice") &&
    config.options.length === 0
  ) {
    throw new ApiError(
      400,
      ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
      "Node capturar_entrada de escolha sem opções configuradas"
    );
  }

  return {
    nodeId,
    prompt: config.prompt,
    promptKey: config.promptKey,
    inputMode: config.inputMode,
    options: config.options,
    minSelections: config.minSelections,
    maxSelections: config.maxSelections,
    variableName: config.variableName,
  };
}

function normalizeRawInput(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (item === undefined || item === null ? "" : String(item).trim()))
      .filter(Boolean);
  }
  const text = String(raw).trim();
  if (!text) return [];
  if (text.includes(",")) {
    return text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [text];
}

export function resolveCapturarEntradaInput(
  config: ReturnType<typeof parseCapturarEntradaConfig>,
  rawInput: unknown
): CapturarEntradaResolved {
  const tokens = normalizeRawInput(rawInput);

  if (config.inputMode === "text") {
    const value = tokens.join(", ");
    if (!value) {
      throw new ApiError(
        400,
        ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
        "Resposta de texto vazia"
      );
    }
    return {
      variableName: config.variableName,
      promptKey: config.promptKey,
      prompt: config.prompt,
      inputMode: config.inputMode,
      value,
      selectedOptions: [],
      nextNodeId: config.next_node_id ?? null,
    };
  }

  const optionById = new Map(config.options.map((opt) => [opt.id, opt]));
  const optionByLabel = new Map(
    config.options.map((opt) => [opt.label.trim().toLowerCase(), opt])
  );

  const selected: CaptureOption[] = [];
  for (const token of tokens) {
    const byId = optionById.get(token);
    if (byId) {
      if (!selected.some((s) => s.id === byId.id)) selected.push(byId);
      continue;
    }
    const byLabel = optionByLabel.get(token.toLowerCase());
    if (byLabel) {
      if (!selected.some((s) => s.id === byLabel.id)) selected.push(byLabel);
      continue;
    }
    throw new ApiError(
      400,
      ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
      `Opção inválida: ${token}`,
      { validOptionIds: config.options.map((o) => o.id) }
    );
  }

  const min = config.inputMode === "multi_choice" ? config.minSelections : 1;
  const max = config.inputMode === "multi_choice" ? config.maxSelections : 1;

  if (selected.length < min) {
    throw new ApiError(
      400,
      ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
      `Selecione pelo menos ${min} opção(ões)`,
      { minSelections: min, maxSelections: max }
    );
  }
  if (selected.length > max) {
    throw new ApiError(
      400,
      ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
      `Selecione no máximo ${max} opção(ões)`,
      { minSelections: min, maxSelections: max }
    );
  }

  const value =
    config.inputMode === "multi_choice"
      ? selected.map((opt) => opt.id)
      : selected[0]?.id ?? "";

  return {
    variableName: config.variableName,
    promptKey: config.promptKey,
    prompt: config.prompt,
    inputMode: config.inputMode,
    value,
    selectedOptions: selected,
    nextNodeId: config.next_node_id ?? null,
  };
}

export function formatCapturarEntradaPrompt(
  config: ReturnType<typeof parseCapturarEntradaConfig>
): string {
  const lines = [config.prompt];
  if (config.inputMode === "single_choice" || config.inputMode === "multi_choice") {
    if (config.inputMode === "multi_choice") {
      lines.push(
        `(Escolha de ${config.minSelections} a ${config.maxSelections} opções)`
      );
    }
    config.options.forEach((opt, index) => {
      lines.push(`${index + 1}. ${opt.label} [${opt.id}]`);
    });
  }
  return lines.join("\n");
}
