export type TransferirAgenteConfig = {
  queue: string;
  handoffMessage: string;
  priority: "normal" | "alta";
  nextNodeId: string | null;
};

export function parseTransferirAgenteConfig(
  config: Record<string, unknown>
): TransferirAgenteConfig {
  const queueRaw = typeof config.queue === "string" ? config.queue.trim() : "";
  const queue = queueRaw || "Geral";
  const handoffMessage =
    typeof config.handoff_message === "string"
      ? config.handoff_message.trim()
      : typeof config.handoffMessage === "string"
        ? config.handoffMessage.trim()
        : "";
  const priority =
    config.priority === "alta" || config.priority === "high" ? "alta" : "normal";
  const nextNodeId =
    typeof config.next_node_id === "string" && config.next_node_id.trim()
      ? config.next_node_id.trim()
      : null;

  return { queue, handoffMessage, priority, nextNodeId };
}

export function executeTransferirAgenteNode(input: {
  config: Record<string, unknown>;
  variables: Record<string, unknown>;
  handoffApplied?: boolean;
}): {
  nextNodeId: string | null;
  details: Record<string, unknown>;
  stopFlow: boolean;
  message?: string;
  parsed: TransferirAgenteConfig;
} {
  const parsed = parseTransferirAgenteConfig(input.config);

  input.variables.handoff_queue = parsed.queue;
  input.variables.handoff_priority = parsed.priority;
  input.variables.handoff_requested = true;
  input.variables.handoff_at = new Date().toISOString();

  const handoffApplied = input.handoffApplied ?? false;

  const message = parsed.handoffMessage
    ? parsed.handoffMessage
    : `Encaminhando você para a fila ${parsed.queue}. Um agente irá atendê-lo em breve.`;

  const stopFlow = !parsed.nextNodeId;

  return {
    nextNodeId: parsed.nextNodeId,
    details: {
      queue: parsed.queue,
      priority: parsed.priority,
      handoffApplied,
      stopFlow,
    },
    stopFlow,
    message,
    parsed,
  };
}
