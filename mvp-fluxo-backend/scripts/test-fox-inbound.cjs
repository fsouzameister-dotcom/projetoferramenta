/* Diagnóstico VPS — rota + execução Fox (CommonJS). */
require("dotenv/config");
const { pool } = require("../dist/db");
const { executeFlow } = require("../dist/flow-executor");
const {
  resolveInboundRoute,
  resolveInboundRouteByFirstMessage,
  whatsAppTwilioSourceKey,
} = require("../dist/inbound-routes");

const TENANT = process.env.DEFAULT_LOGIN_TENANT_ID || "00000000-0000-4000-8000-000000000001";
const FLOW = "37dc75e1-742f-4f22-8d34-93dfaa0a66c1";
const ACCOUNT_SID = process.env.TEST_TWILIO_ACCOUNT_SID?.trim();
const TO = process.env.TEST_TWILIO_WHATSAPP_NUMBER?.trim()?.replace(/^\+/, "");
if (!ACCOUNT_SID || !TO) {
  console.error("Defina TEST_TWILIO_ACCOUNT_SID e TEST_TWILIO_WHATSAPP_NUMBER no ambiente.");
  process.exit(1);
}
const sourceKey = whatsAppTwilioSourceKey(ACCOUNT_SID, TO);

(async () => {
  const msgRoute = await resolveInboundRouteByFirstMessage({
    tenantId: TENANT,
    sourceType: "twilio_whatsapp",
    sourceKey,
    messageText: "cadastrar-se",
  });
  console.log("messageRoute", msgRoute ? msgRoute.label : null);

  const defaultRoute = await resolveInboundRoute({
    tenantId: TENANT,
    sourceType: "twilio_whatsapp",
    sourceKey,
  });
  console.log("defaultRoute", defaultRoute ? defaultRoute.label : null);

  const exec = await executeFlow(FLOW, TENANT, {
    userInput: "cadastrar-se",
    phone: "+5511992007226",
    sessionId: "test:fox:diag",
  });
  console.log("executeFlow", exec.status, exec.messages?.length, exec.messages?.[0]?.slice(0, 60));
  await pool.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
