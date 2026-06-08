export const STALE_SENDING_MINUTES = 5;

export function buildTemplateParams(
  columnMapping: Record<string, string>,
  row: Record<string, string>
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [slot, column] of Object.entries(columnMapping)) {
    params[slot] = String(row[column] ?? "").trim();
  }
  return params;
}

export function nextStatusAfterStaleSending(
  staleRecoveries: number
): { status: "pending" | "failed"; errorDescription?: string } {
  if (staleRecoveries < 1) {
    return { status: "pending" };
  }
  return { status: "failed", errorDescription: "Timeout no envio (stale sending)" };
}

export function renderTemplatePreview(
  bodyPreview: string,
  columnMapping: Record<string, string>,
  sampleRow: Record<string, string>
): string {
  return bodyPreview.replace(/\{\{(\w+)\}\}/g, (_, slot: string) => {
    const column = columnMapping[slot];
    if (!column) return `{{${slot}}}`;
    const value = sampleRow[column];
    return value != null && String(value).trim() ? String(value).trim() : `{{${slot}}}`;
  });
}
