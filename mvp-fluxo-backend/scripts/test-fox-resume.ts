/**
 * Simula cadastrar-se + resposta "1" no fluxo Fox (VPS/local).
 */
import "dotenv/config";
import { pool } from "../src/db";
import { processInboundMessage } from "../src/inbound-orchestrator";
import { whatsAppTwilioSourceKey } from "../src/inbound-routes";
import { loadInboundFlowSession } from "../src/inbound-flow-session";

const TENANT = process.env.DEFAULT_LOGIN_TENANT_ID?.trim() || "00000000-0000-4000-8000-000000000001";
const ACCOUNT_SID = process.env.TEST_TWILIO_ACCOUNT_SID?.trim();
const TO = process.env.TEST_TWILIO_TO?.trim() || "551150284949";
const PHONE = process.env.TEST_PHONE?.trim() || "+5511992007226";
async function main() {
  if (!ACCOUNT_SID) {
    throw new Error("Defina TEST_TWILIO_ACCOUNT_SID no ambiente");
  }
  const sourceKey = whatsAppTwilioSourceKey(ACCOUNT_SID, TO);
  const ts = Date.now();
  const r1 = await processInboundMessage({
    tenantId: TENANT,
    sourceType: "twilio_whatsapp",
    sourceKey,
    messageText: "cadastrar-se",
    phone: PHONE,
    providerMessageId: `diag-cad-${ts}`,
    mirrorToAgentInbox: true,
  });
  console.log("step1", r1);

  const session = await loadInboundFlowSession({
    tenantId: TENANT,
    contactKey: `phone:${PHONE.replace(/\D/g, "")}`,
    phone: PHONE,
    conversationId: r1.conversationId,
  });
  console.log("session", session ? { flowId: session.flowId, node: session.awaitingInput.nodeId } : null);

  const r2 = await processInboundMessage({
    tenantId: TENANT,
    sourceType: "twilio_whatsapp",
    sourceKey,
    messageText: "1",
    phone: PHONE,
    providerMessageId: `diag-one-${ts}`,
    mirrorToAgentInbox: true,
  });
  console.log("step2", r2);
  console.log("step2 messages", r2.messages?.map((m) => m.slice(0, 100)));

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
