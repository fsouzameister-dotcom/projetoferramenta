import { parseTransferirAgenteConfig } from "./transferir-agente";

type FlowNodeLite = {
  id: string;
  type: string;
  name: string;
  config: unknown;
};

function normalizeHandoffText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Pedido explícito de atendimento humano (atalho global no fluxo). */
export function detectHumanHandoffRequest(message: string): boolean {
  const norm = normalizeHandoffText(message);
  if (!norm) return false;

  const patterns = [
    /\b(humano|atendente|pessoa\s+real|gente\s+de\s+verdade)\b/,
    /\b(falar|falo|fale|passa|passe|transfere|transfira|encaminh\w*)\b.{0,40}\b(humano|atendente|pessoa|alguem|gente|voces|suporte)\b/,
    /\b(quero|preciso|gostaria)\b.{0,30}\b(humano|atendente|pessoa|suporte humano)\b/,
    /\bnao\s+fui\s+transferid/,
    /^\?{2,}$/,
  ];

  return patterns.some((pattern) => pattern.test(norm));
}

/** Escolhe o node transferir_agente padrão do fluxo (prioriza fila Geral). */
export function findPreferredHandoffNodeId(nodes: FlowNodeLite[]): string | null {
  const handoffNodes = nodes.filter((n) => n.type === "transferir_agente");
  if (!handoffNodes.length) return null;

  const geral = handoffNodes.find((n) => {
    const cfg =
      n.config && typeof n.config === "object"
        ? (n.config as Record<string, unknown>)
        : {};
    const parsed = parseTransferirAgenteConfig(cfg);
    return parsed.queue.toLowerCase() === "geral";
  });
  if (geral) return geral.id;

  const byName = handoffNodes.find((n) => /transferir\s+geral/i.test(n.name));
  if (byName) return byName.id;

  return handoffNodes[0]?.id ?? null;
}

export function matchHumanHandoffTransition<T extends { id: string; condition: string; label?: string }>(
  transitions: T[]
): T | undefined {
  return transitions.find(
    (t) =>
      t.id === "esc_humano" ||
      /\bhumano\b/i.test(t.label ?? "") ||
      /\b(humano|atendente)\b/i.test(t.condition)
  );
}
