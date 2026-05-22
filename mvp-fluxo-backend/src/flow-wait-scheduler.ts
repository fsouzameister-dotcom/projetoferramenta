import { randomUUID } from "node:crypto";
import { redis } from "./redis";
import type { ExecuteFlowInput } from "./flow-executor";

const DUE_ZSET = "flow:wait:due";
const PAYLOAD_PREFIX = "flow:wait:payload:";

export type ScheduledFlowWait = {
  id: string;
  tenantId: string;
  flowId: string;
  nodeId: string;
  nodeType: string;
  dueAtMs: number;
  nextNodeIdOnTimeout: string;
  executeInput: ExecuteFlowInput;
};

function payloadKey(id: string): string {
  return `${PAYLOAD_PREFIX}${id}`;
}

function scheduleKey(input: {
  tenantId: string;
  flowId: string;
  nodeId: string;
  conversationId?: string;
  sessionId?: string;
  phone?: string;
}): string {
  const parts = [
    input.tenantId,
    input.flowId,
    input.nodeId,
    input.conversationId ?? "",
    input.sessionId ?? "",
    input.phone ?? "",
  ];
  return parts.join(":");
}

export async function cancelFlowWaitSchedule(input: {
  tenantId: string;
  flowId: string;
  nodeId: string;
  conversationId?: string;
  sessionId?: string;
  phone?: string;
}): Promise<void> {
  const sk = scheduleKey(input);
  const existingId = await redis.get(`flow:wait:sk:${sk}`);
  if (!existingId) return;
  await redis.zrem(DUE_ZSET, existingId);
  await redis.del(payloadKey(existingId), `flow:wait:sk:${sk}`);
}

export async function scheduleFlowWaitTimeout(input: {
  tenantId: string;
  flowId: string;
  nodeId: string;
  nodeType: string;
  waitTimeoutSeconds: number;
  nextNodeIdOnTimeout: string;
  executeInput: ExecuteFlowInput;
}): Promise<string | null> {
  if (input.waitTimeoutSeconds <= 0 || !input.nextNodeIdOnTimeout) return null;

  const hasScope =
    Boolean(input.executeInput.conversationId) ||
    Boolean(input.executeInput.sessionId) ||
    Boolean(input.executeInput.phone);
  if (!hasScope) return null;

  await cancelFlowWaitSchedule({
    tenantId: input.tenantId,
    flowId: input.flowId,
    nodeId: input.nodeId,
    conversationId: input.executeInput.conversationId,
    sessionId: input.executeInput.sessionId,
    phone: input.executeInput.phone,
  });

  const id = randomUUID();
  const dueAtMs = Date.now() + input.waitTimeoutSeconds * 1000;
  const sk = scheduleKey({
    tenantId: input.tenantId,
    flowId: input.flowId,
    nodeId: input.nodeId,
    conversationId: input.executeInput.conversationId,
    sessionId: input.executeInput.sessionId,
    phone: input.executeInput.phone,
  });

  const payload: ScheduledFlowWait = {
    id,
    tenantId: input.tenantId,
    flowId: input.flowId,
    nodeId: input.nodeId,
    nodeType: input.nodeType,
    dueAtMs,
    nextNodeIdOnTimeout: input.nextNodeIdOnTimeout,
    executeInput: {
      ...input.executeInput,
      startNodeId: input.nodeId,
      userInput: undefined,
      resumeReason: "timeout",
    },
  };

  await redis
    .multi()
    .set(payloadKey(id), JSON.stringify(payload), "EX", input.waitTimeoutSeconds + 3600)
    .set(`flow:wait:sk:${sk}`, id, "EX", input.waitTimeoutSeconds + 3600)
    .zadd(DUE_ZSET, dueAtMs, id)
    .exec();

  return id;
}

export async function processDueFlowWaitTimeouts(
  limit = 20
): Promise<number> {
  const now = Date.now();
  const ids = await redis.zrangebyscore(DUE_ZSET, 0, now, "LIMIT", 0, limit);
  if (!ids.length) return 0;

  let processed = 0;
  const { executeFlow } = await import("./flow-executor.js");

  for (const id of ids) {
    const removed = await redis.zrem(DUE_ZSET, id);
    if (!removed) continue;

    const raw = await redis.get(payloadKey(id));
    await redis.del(payloadKey(id));
    if (!raw) continue;

    let payload: ScheduledFlowWait;
    try {
      payload = JSON.parse(raw) as ScheduledFlowWait;
    } catch {
      continue;
    }

    if (payload.executeInput.conversationId || payload.executeInput.sessionId || payload.executeInput.phone) {
      await cancelFlowWaitSchedule({
        tenantId: payload.tenantId,
        flowId: payload.flowId,
        nodeId: payload.nodeId,
        conversationId: payload.executeInput.conversationId,
        sessionId: payload.executeInput.sessionId,
        phone: payload.executeInput.phone,
      });
    }

    try {
      await executeFlow(payload.flowId, payload.tenantId, payload.executeInput);
      processed += 1;
    } catch {
      // evita travar o worker; timeout pode ser reagendado manualmente
    }
  }

  return processed;
}

export function startFlowWaitScheduler(intervalMs = 5_000): NodeJS.Timeout {
  return setInterval(() => {
    void processDueFlowWaitTimeouts().catch(() => undefined);
  }, intervalMs);
}
