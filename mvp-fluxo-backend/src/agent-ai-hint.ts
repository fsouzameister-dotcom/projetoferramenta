/** Copiloto interno — dicas para o agente humano (não mensagens ao cliente). */

export const AGENT_COPILOT_SYSTEM_PROMPT = `Você é um copiloto INTERNO para o agente humano (operador) de atendimento.
Sua saída NUNCA é enviada ao cliente; apenas o agente lê.

Regras obrigatórias:
- Escreva UMA dica curta (máximo 220 caracteres) em português do Brasil.
- Dirija-se ao agente na 2ª pessoa imperativa: "Confirme...", "Verifique...", "Priorize...", "Evite...", "Registre...".
- NÃO redija mensagem pronta para WhatsApp nem cumprimente o cliente.
- NÃO use tom de chatbot falando com o cliente ("Como posso ajudar?", "Obrigado por entrar em contato").
- Sugira ação operacional: o que investigar, validar, perguntar, oferecer ou encerrar neste momento.
- Baseie-se no contexto fornecido; se faltar informação, indique o que o agente deve esclarecer primeiro.`;

export type AgentHintContext = {
  contactName: string;
  tags: string[];
  recentMessages: string[];
};

export function buildAgentHintUserPrompt(ctx: AgentHintContext): string {
  const lines = [
    "Analise o atendimento abaixo e produza a dica para o AGENTE (não para o cliente).",
    `Nome do contato: ${ctx.contactName || "não informado"}`,
    `Tags: ${ctx.tags.length ? ctx.tags.join(", ") : "nenhuma"}`,
    `Últimas mensagens da conversa:`,
  ];
  if (ctx.recentMessages.length) {
    for (const msg of ctx.recentMessages) {
      lines.push(`- ${msg}`);
    }
  } else {
    lines.push("- (sem mensagens recentes)");
  }
  lines.push("", "Responda somente com a dica para o agente, sem aspas e sem prefixos.");
  return lines.join("\n");
}

export function buildAgentHintFallback(ctx: AgentHintContext): string {
  const heuristicText = `${ctx.tags.join(" ")} ${ctx.recentMessages.join(" ")}`.toLowerCase();

  if (/(reclama|insatisfeit|ruim|cancel|atras|problema|erro)/.test(heuristicText)) {
    return "Valide o motivo da insatisfação com o cliente, confirme entendimento e proponha um próximo passo com prazo definido.";
  }
  if (/(compr|contrat|plano|fechado|assin|preço|preco|valor)/.test(heuristicText)) {
    return "Confirme o objetivo comercial do cliente e alinhe a oferta ao histórico antes de avançar no fechamento.";
  }
  if (!ctx.recentMessages.length) {
    return "Abra confirmando o motivo do contato e registre a necessidade principal antes de propor soluções.";
  }
  return "Resuma o que o cliente pediu, elimine uma dúvida crítica e só então sugira a melhor opção de continuidade.";
}

/** Detecta respostas que parecem mensagem ao cliente em vez de coaching ao agente. */
export function isLikelyCustomerFacingHint(hint: string): boolean {
  const text = hint.trim();
  if (!text) return true;

  const agentMarkers =
    /\b(confirme|verifique|priorize|evite|sugira|pergunte|valide|investigue|registre|escalone|documente|alinhe|resuma|identifique|cheque)\b/i;
  if (agentMarkers.test(text)) return false;

  if (/^(ol[aá]|oi|bom dia|boa tarde|boa noite|caro|prezad)/i.test(text)) return true;
  if (/\b(como posso ajudar|entrar em contato|agradeç|obrigad[oa] por|fico à disposição|fico a disposição)\b/i.test(text)) {
    return true;
  }
  return false;
}

export function normalizeAgentHintText(raw: string, maxLen = 220): string {
  return raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}
