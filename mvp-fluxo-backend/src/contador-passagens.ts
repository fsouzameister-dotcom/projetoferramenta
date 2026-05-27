export type ContadorPassagensConfig = {
  limitePassagens: number;
  variableName: string;
  increment: number;
  nextNodeIdWithin: string | null;
  nextNodeIdExceeded: string | null;
};

function readPositiveInt(raw: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      return Math.floor(v);
    }
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.trim());
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    }
  }
  return fallback;
}

export function parseContadorPassagensConfig(
  raw: Record<string, unknown>,
  nodeId: string
): ContadorPassagensConfig {
  const limitePassagens = readPositiveInt(
    raw,
    ["limite_passagens", "limitePassagens", "max_passes", "maxPasses"],
    3
  );
  const variableName =
    typeof raw.variableName === "string" && raw.variableName.trim()
      ? raw.variableName.trim()
      : typeof raw.variable_name === "string" && raw.variable_name.trim()
        ? raw.variable_name.trim()
        : `contador_${nodeId.slice(0, 8)}`;
  const increment = readPositiveInt(raw, ["increment", "incremento"], 1) || 1;

  const nextWithin =
    typeof raw.next_node_id_within === "string" && raw.next_node_id_within.trim()
      ? raw.next_node_id_within.trim()
      : typeof raw.nextNodeIdWithin === "string" && raw.nextNodeIdWithin.trim()
        ? raw.nextNodeIdWithin.trim()
        : null;
  const nextExceeded =
    typeof raw.next_node_id_exceeded === "string" && raw.next_node_id_exceeded.trim()
      ? raw.next_node_id_exceeded.trim()
      : typeof raw.nextNodeIdExceeded === "string" && raw.nextNodeIdExceeded.trim()
        ? raw.nextNodeIdExceeded.trim()
        : null;

  return {
    limitePassagens,
    variableName,
    increment,
    nextNodeIdWithin: nextWithin,
    nextNodeIdExceeded: nextExceeded,
  };
}

export function executeContadorPassagensNode(input: {
  config: Record<string, unknown>;
  nodeId: string;
  variables: Record<string, unknown>;
}): {
  nextNodeId: string | null;
  details: Record<string, unknown>;
} {
  const parsed = parseContadorPassagensConfig(input.config, input.nodeId);
  const previous = Number(input.variables[parsed.variableName] ?? 0);
  const count = previous + parsed.increment;
  input.variables[parsed.variableName] = count;
  const exceeded = count > parsed.limitePassagens;
  input.variables[`${parsed.variableName}_ultrapassou`] = exceeded;
  input.variables.contador_ultrapassou = exceeded;

  const nextNodeId = exceeded
    ? parsed.nextNodeIdExceeded
    : parsed.nextNodeIdWithin;

  return {
    nextNodeId,
    details: {
      variableName: parsed.variableName,
      previousCount: previous,
      count,
      increment: parsed.increment,
      limitePassagens: parsed.limitePassagens,
      exceeded,
      branch: exceeded ? "exceeded" : "within",
    },
  };
}
