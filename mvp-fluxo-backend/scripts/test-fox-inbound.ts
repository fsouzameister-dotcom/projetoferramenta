/**
 * Diagnóstico local/VPS: rota Fox + execução do fluxo.
 * Uso: npx tsx scripts/test-fox-inbound.ts
 */
import "dotenv/config";
import { pool } from "../src/db";
import { executeFlow } from "../src/flow-executor";
import { processInboundMessage } from "../src/inbound-orchestrator";
import {
  resolveInboundRoute,
  resolveInboundRouteByFirstMessage,
  whatsAppTwilioSourceKey,
} from "../src/inbound-routes";
import { getOutboundWhatsAppContext } from "../src/whatsapp-channels";

const TENANT = process.env.DEFAULT_LOGIN_TENANT_ID?.trim() || "00000000-0000-4000-8000-000000000001";
const FLOW = "37dc75e1-742f-4f22-8d34-93dfaa0a66c1";
const ACCOUNT_SID = process.env.TEST_TWILIO_ACCOUNT_SID?.trim();
const TO = process.env.TEST_TWILIO_WHATSAPP_NUMBER?.trim()?.replace(/^\+/, "");
const PHONE = process.env.TEST_PHONE?.trim();
if (!ACCOUNT_SID || !TO || !PHONE) {
  console.error(
    "Defina TEST_TWILIO_ACCOUNT_SID, TEST_TWILIO_WHATSAPP_NUMBER e TEST_PHONE no ambiente."
  );
  process.exit(1);
}
const sourceKey = whatsAppTwilioSourceKey(ACCOUNT_SID, TO);

async function main() {
  const msgRoute = await resolveInboundRouteByFirstMessage({
    tenantId: TENANT,
    sourceType: "twilio_whatsapp",
    sourceKey,
    messageText: "cadastrar-se",
  });
  console.log("messageRoute:", msgRoute?.label ?? null, msgRoute?.flow_id ?? null);

  const defaultRoute = await resolveInboundRoute({
    tenantId: TENANT,
    sourceType: "twilio_whatsapp",
    sourceKey,
  });
  console.log("defaultRoute:", defaultRoute?.label ?? null);

  const wa = await getOutboundWhatsAppContext(TENANT);
  console.log("whatsapp:", wa?.provider ?? null);

  const exec = await executeFlow(FLOW, TENANT, {
    userInput: "cadastrar-se",
    phone: PHONE,
    sessionId: "test:fox:diag",
  });
  console.log("executeFlow:", {
    status: exec.status,
    messages: exec.messages?.length ?? 0,
    preview: exec.messages?.[0]?.slice(0, 80),
    awaiting: exec.awaitingInput?.nodeId,
  });

  const inbound = await processInboundMessage({
    tenantId: TENANT,
    sourceType: "twilio_whatsapp",
    sourceKey,
    messageText: "cadastrar-se",
    phone: PHONE,
    providerMessageId: `diag-${Date.now()}`,
    mirrorToAgentInbox: true,
  });
  console.log("processInbound:", inbound);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
