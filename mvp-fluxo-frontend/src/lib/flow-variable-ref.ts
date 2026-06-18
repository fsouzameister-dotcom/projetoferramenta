/** Extrai o nome interno de {{variavel}}; remove chaves duplicadas e normaliza espaços. */
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

export function formatFlowVariableDisplay(raw: string): string {
  const inner = normalizeFlowVariableName(raw);
  if (!inner) return "";
  return `{{${inner}}}`;
}

export function isFlowVariableRef(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/^\{\{\s*[\w.\s]+\s*\}\}$/.test(trimmed)) return true;
  return /^[\w.]+$/.test(trimmed);
}

/** Persiste sempre como {{nome}} no config do node. */
export function toStoredFlowVariableRef(raw: string): string {
  const inner = normalizeFlowVariableName(raw);
  return inner ? `{{${inner}}}` : "";
}
