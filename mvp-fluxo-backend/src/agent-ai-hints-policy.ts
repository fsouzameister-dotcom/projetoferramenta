import { pool } from "./db";
import {
  getQueueByKey,
  listQueuesByTenant,
  resolveConversationQueueKey,
} from "./service-queues";
import { getTenantServiceSettings } from "./tenant-service-settings";

export type AgentAiHintsConfig = {
  tenantAiHintsEnabled: boolean;
  queueAiHintsByKey: Record<string, boolean>;
};

export async function getAgentAiHintsConfig(
  tenantId: string
): Promise<AgentAiHintsConfig> {
  const [tenantSettings, queues] = await Promise.all([
    getTenantServiceSettings(tenantId),
    listQueuesByTenant(tenantId),
  ]);
  const queueAiHintsByKey: Record<string, boolean> = {};
  for (const queue of queues) {
    queueAiHintsByKey[queue.key] = queue.agentAiHintsEnabled;
  }
  return {
    tenantAiHintsEnabled: tenantSettings.agentAiHintsEnabled,
    queueAiHintsByKey,
  };
}

export async function isAgentAiHintsEnabled(
  tenantId: string,
  rawQueueKey?: string | null
): Promise<boolean> {
  const tenantSettings = await getTenantServiceSettings(tenantId);
  if (!tenantSettings.agentAiHintsEnabled) return false;

  const queueKey = rawQueueKey?.trim()
    ? await resolveConversationQueueKey(tenantId, rawQueueKey)
    : "geral";
  const queue = await getQueueByKey(tenantId, queueKey);
  if (!queue) return true;
  return queue.agentAiHintsEnabled;
}

export async function isAgentAiHintsEnabledForConversation(
  tenantId: string,
  conversationId: string
): Promise<boolean> {
  const result = await pool.query<{ metadata: { queue?: string } | null }>(
    `SELECT metadata FROM agent_conversations WHERE id = $1::uuid AND tenant_id = $2::uuid`,
    [conversationId, tenantId]
  );
  if (!result.rows[0]) {
    return isAgentAiHintsEnabled(tenantId, null);
  }
  return isAgentAiHintsEnabled(tenantId, result.rows[0].metadata?.queue);
}
