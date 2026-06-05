import { redis } from "./redis";

const SESSION_PREFIX = "inbound:flow:session:";

function sessionRedisKey(tenantId: string, contactKey: string): string {
  return `${SESSION_PREFIX}${tenantId}:${contactKey}`;
}

export function inboundFlowContactKeyFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `phone:${digits}`;
}

/** Remove sessão Redis do fluxo inbound para o telefone (handoff, agente assume, etc.). */
export async function clearInboundFlowSessionForPhone(
  tenantId: string,
  phone: string
): Promise<void> {
  const trimmed = phone.trim();
  if (!trimmed) return;
  const contactKey = inboundFlowContactKeyFromPhone(trimmed);
  try {
    await redis.del(sessionRedisKey(tenantId, contactKey));
  } catch {
    /* sessão Redis opcional */
  }
}
