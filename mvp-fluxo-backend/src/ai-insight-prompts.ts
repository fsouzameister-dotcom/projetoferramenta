export const INSIGHT_OUTPUT_FIELDS = [
  "summary",
  "highlights",
  "risks",
  "opportunities",
  "metrics",
] as const;

export const PLATFORM_INSIGHT_BASE_PROMPT = `Você é um analista de operações de atendimento e pesquisa.
Analise o contexto de conversas fornecido e produza insights acionáveis para gestão.

Regras obrigatórias:
- Responda APENAS com um objeto JSON válido, sem markdown nem texto fora do JSON.
- Não invente fatos que não estejam no contexto.
- Não inclua dados pessoais identificáveis além do que já está no contexto (evite repetir telefones completos).
- Use português do Brasil.
- Campos obrigatórios no JSON:
  - "summary": string (parágrafo executivo)
  - "highlights": array de strings (pontos positivos)
  - "risks": array de strings (riscos ou problemas)
  - "opportunities": array de strings (melhorias recomendadas)
  - "metrics": objeto com números/chaves relevantes (ex.: totalConversas, taxaEncerramento)`;

export function buildInsightSystemPrompt(input: {
  templateSystemPrompt?: string | null;
  promptOverride?: string | null;
}): string {
  const parts = [PLATFORM_INSIGHT_BASE_PROMPT];
  const template = input.templateSystemPrompt?.trim();
  if (template) parts.push(template);
  const override = input.promptOverride?.trim();
  if (override) {
    parts.push(`Instruções adicionais para esta execução:\n${override}`);
  }
  return parts.join("\n\n");
}

export function buildInsightUserMessage(contextBlock: string): string {
  return `Analise o contexto abaixo e gere o JSON de insights conforme as instruções do sistema.

Contexto:
${contextBlock}`;
}

export function buildResolvedInsightPrompt(input: {
  templateSystemPrompt?: string | null;
  promptOverride?: string | null;
  contextBlock: string;
}): string {
  return `${buildInsightSystemPrompt(input)}\n\n---\n\n${buildInsightUserMessage(input.contextBlock)}`;
}

export type ParsedInsightResult = {
  summary: string;
  highlights: string[];
  risks: string[];
  opportunities: string[];
  metrics: Record<string, unknown>;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : String(item)))
    .filter(Boolean);
}

export function parseInsightResultFromModel(
  parsed: Record<string, unknown> | null,
  rawText: string
): ParsedInsightResult {
  const summary =
    typeof parsed?.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : rawText.slice(0, 2000).trim() || "Resumo indisponível.";

  const metrics =
    parsed?.metrics && typeof parsed.metrics === "object" && !Array.isArray(parsed.metrics)
      ? (parsed.metrics as Record<string, unknown>)
      : {};

  return {
    summary,
    highlights: asStringArray(parsed?.highlights),
    risks: asStringArray(parsed?.risks),
    opportunities: asStringArray(parsed?.opportunities),
    metrics,
  };
}
