export type FlowSpreadsheetColumn = {
  key: string;
  header: string;
  nodeId: string;
  questionKey: string;
  variableName: string;
  order: number;
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function extractNextNodeIds(node: { type: string; config: unknown }): string[] {
  const config = asObject(node.config);
  const ids: string[] = [];
  const keys = [
    "next_node_id",
    "next_node_id_true",
    "next_node_id_false",
    "next_node_id_within",
    "next_node_id_exceeded",
    "nextNodeId",
    "nextNodeIdTrue",
    "nextNodeIdFalse",
  ];
  for (const key of keys) {
    const v = config[key];
    if (typeof v === "string" && v.trim()) ids.push(v.trim());
  }
  return ids;
}

const REPORTABLE_NODE_TYPES = new Set(["capturar_entrada", "receber_mensagem", "tabulacao"]);

/** Percorre o fluxo e define colunas na ordem de aparição (inclui ramificações). */
export function buildReportColumnsFromNodes(
  nodes: Array<{ id: string; type: string; name: string; config: unknown; is_start?: boolean }>
): FlowSpreadsheetColumn[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start =
    nodes.find((n) => n.is_start) ||
    nodes.find((n) => n.type === "inicio") ||
    nodes[0];
  if (!start) return [];

  const columns: FlowSpreadsheetColumn[] = [];
  const seenNodeIds = new Set<string>();
  let order = 0;

  function pushColumn(node: (typeof nodes)[0]) {
    const config = asObject(node.config);
    const variableName =
      typeof config.variableName === "string" && config.variableName.trim()
        ? config.variableName.trim()
        : "";
    const promptKeyRaw =
      (typeof config.promptKey === "string" && config.promptKey.trim()) ||
      (typeof config.prompt_key === "string" && config.prompt_key.trim()) ||
      variableName ||
      node.id;
    const questionKey = promptKeyRaw
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);

    const header =
      node.name?.trim() ||
      variableName ||
      questionKey.replace(/_/g, " ");

    columns.push({
      key: `${node.id}:${questionKey}`,
      header,
      nodeId: node.id,
      questionKey,
      variableName,
      order: order++,
    });
  }

  function visit(nodeId: string, depth = 0) {
    if (!nodeId || depth > 300) return;
    const node = byId.get(nodeId);
    if (!node) return;

    if (REPORTABLE_NODE_TYPES.has(node.type) && !seenNodeIds.has(node.id)) {
      seenNodeIds.add(node.id);
      pushColumn(node);
    }

    for (const nextId of extractNextNodeIds(node)) {
      visit(nextId, depth + 1);
    }
  }

  const startNext = extractNextNodeIds(start)[0];
  if (startNext) visit(startNext);
  else visit(start.id);

  return columns;
}

export function flowSpreadsheetToCsv(input: {
  columns: FlowSpreadsheetColumn[];
  rows: Array<{
    contato: string;
    startedAt: string | null;
    completedAt: string | null;
    values: Record<string, string>;
  }>;
}): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const headerCells = [
    "Contato",
    "Início",
    "Última resposta",
    ...input.columns.map((c) => c.header),
  ];
  const lines = [headerCells.map(escape).join(";")];

  for (const row of input.rows) {
    const cells = [
      row.contato,
      row.startedAt ? new Date(row.startedAt).toLocaleString("pt-BR") : "",
      row.completedAt ? new Date(row.completedAt).toLocaleString("pt-BR") : "",
      ...input.columns.map((c) => row.values[c.key] ?? ""),
    ];
    lines.push(cells.map((c) => escape(String(c))).join(";"));
  }

  return `\uFEFF${lines.join("\r\n")}`;
}
