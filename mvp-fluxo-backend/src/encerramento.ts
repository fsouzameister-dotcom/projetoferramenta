export type EncerramentoConfig = {
  endMessage: string;
  reasonKey: string;
};

export function parseEncerramentoConfig(
  config: Record<string, unknown>
): EncerramentoConfig {
  const endMessage =
    typeof config.end_message === "string"
      ? config.end_message.trim()
      : typeof config.endMessage === "string"
        ? config.endMessage.trim()
        : "";
  const reasonKey =
    typeof config.reason_key === "string" && config.reason_key.trim()
      ? config.reason_key.trim()
      : typeof config.reason === "string" && config.reason.trim()
        ? config.reason.trim()
        : "flow_completed";

  return { endMessage, reasonKey };
}

export function executeEncerramentoNode(input: {
  config: Record<string, unknown>;
  variables: Record<string, unknown>;
}): {
  nextNodeId: null;
  details: Record<string, unknown>;
  message?: string;
} {
  const parsed = parseEncerramentoConfig(input.config);

  input.variables.flow_status = "ended";
  input.variables.flow_end_reason = parsed.reasonKey;
  input.variables.flow_ended_at = new Date().toISOString();

  return {
    nextNodeId: null,
    details: {
      reasonKey: parsed.reasonKey,
      flowEnded: true,
    },
    message: parsed.endMessage || undefined,
  };
}
