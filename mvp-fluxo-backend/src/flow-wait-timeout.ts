export type FlowWaitTimeoutConfig = {
  /** Segundos; 0 = desligado */
  waitTimeoutSeconds: number;
  nextNodeIdOnTimeout: string | null;
};

export type FlowMessageSendDelayConfig = {
  /** Aguarda N segundos após o node anterior (ex.: receber resposta) antes de enviar; 0 = imediato */
  sendDelaySeconds: number;
};

const MAX_WAIT_TIMEOUT_SECONDS = 86_400;
const MAX_SEND_DELAY_SECONDS = 300;

function readPositiveInt(
  raw: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      return Math.floor(v);
    }
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.trim());
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
  }
  return undefined;
}

function readNextOnTimeout(raw: Record<string, unknown>): string | null {
  const v =
    raw.next_node_id_on_timeout ??
    raw.nextNodeIdOnTimeout ??
    raw.timeout_next_node_id;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export function parseFlowWaitTimeoutConfig(
  raw: Record<string, unknown>
): FlowWaitTimeoutConfig {
  const seconds = readPositiveInt(raw, [
    "wait_timeout_seconds",
    "waitTimeoutSeconds",
    "timeout_seconds",
    "timeoutSeconds",
  ]);
  const waitTimeoutSeconds = seconds
    ? Math.min(seconds, MAX_WAIT_TIMEOUT_SECONDS)
    : 0;
  const nextNodeIdOnTimeout =
    waitTimeoutSeconds > 0 ? readNextOnTimeout(raw) : null;
  return { waitTimeoutSeconds, nextNodeIdOnTimeout };
}

export function parseFlowMessageSendDelayConfig(
  raw: Record<string, unknown>
): FlowMessageSendDelayConfig {
  const seconds = readPositiveInt(raw, [
    "send_delay_seconds",
    "sendDelaySeconds",
    "delay_before_send_seconds",
    "delayBeforeSendSeconds",
    /** legado — mesmo campo, semântica corrigida para “antes de enviar” */
    "delay_after_seconds",
    "delayAfterSeconds",
  ]);
  const sendDelaySeconds = seconds
    ? Math.min(seconds, MAX_SEND_DELAY_SECONDS)
    : 0;
  return { sendDelaySeconds };
}

/** @deprecated use parseFlowMessageSendDelayConfig */
export const parseFlowDelayAfterConfig = parseFlowMessageSendDelayConfig;

export function isWaitTimeoutElapsed(
  awaitingStartedAt: string | undefined,
  waitTimeoutSeconds: number,
  nowMs: number = Date.now()
): boolean {
  if (waitTimeoutSeconds <= 0 || !awaitingStartedAt) return false;
  const started = Date.parse(awaitingStartedAt);
  if (!Number.isFinite(started)) return false;
  return nowMs - started >= waitTimeoutSeconds * 1000;
}

export function applyResponseTimeoutVariables(
  variables: Record<string, unknown>,
  variableName: string
): void {
  variables.response_timed_out = true;
  variables[`${variableName}_timed_out`] = true;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
