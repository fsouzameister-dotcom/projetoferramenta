export function resolveFlowTemplate(
  text: string,
  variables: Record<string, unknown>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    const v = variables[varName];
    return v === undefined || v === null ? `{{${varName}}}` : String(v);
  });
}

export function buildCaptureRetryPrompt(
  variables: Record<string, unknown>,
  errorMessage: string,
  questionMessage: string
): string {
  return [resolveFlowTemplate(errorMessage, variables), questionMessage]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}
