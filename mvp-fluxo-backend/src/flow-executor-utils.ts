export function parseJsonFromModel(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

/** Extrai o nome interno de {{variavel}} ou variavel; remove chaves duplicadas e espaços. */
export function normalizeFlowVariableName(raw: string): string {
  let s = raw.trim();
  let prev = "";
  while (s !== prev) {
    prev = s;
    const wrapped = s.match(/^\{\{\s*([\w.\s]+?)\s*\}\}$/);
    if (wrapped) {
      s = wrapped[1].trim();
      continue;
    }
    if (s.startsWith("{{") && s.endsWith("}}") && s.length > 4) {
      s = s.slice(2, -2).trim();
      continue;
    }
    break;
  }
  return s.replace(/\s+/g, "_");
}

export function normalizeMensagemTestUserInput(
  parsed: {
    interactiveType: "none" | "buttons" | "list";
    buttons: Array<{ id: string; label: string }>;
    listItems: Array<{ id: string; label: string }>;
  },
  raw: string
): string {
  const token = raw.trim();
  if (!token) return token;
  if (parsed.interactiveType === "buttons") {
    const hit = parsed.buttons.find((b) => b.id === token || b.label === token);
    if (hit) return hit.label;
  }
  if (parsed.interactiveType === "list") {
    const hit = parsed.listItems.find((b) => b.id === token || b.label === token);
    if (hit) return hit.label;
  }
  return token;
}
