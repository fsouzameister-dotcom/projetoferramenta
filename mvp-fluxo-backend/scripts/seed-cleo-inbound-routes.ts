/**
 * Rotas inbound: WhatsApp padrão → Cleo; link do site (wa.me) → Cleo por gatilho de mensagem.
 *
 * Uso:
 *   npm run seed:cleo-inbound
 *   CLEO_WHATSAPP_DIGITS=551150284949 npm run seed:cleo-inbound
 */
import "dotenv/config";
import { pool } from "../src/db";
import {
  createInboundRoute,
  listInboundRoutes,
  updateInboundRoute,
  whatsAppTwilioSourceKey,
} from "../src/inbound-routes";
import { WHATSAPP_PROVIDER_TWILIO } from "../src/whatsapp-channels";

const TENANT_ID =
  process.env.DEFAULT_LOGIN_TENANT_ID?.trim() ||
  "00000000-0000-4000-8000-000000000001";
const FLOW_NAME = process.env.SEED_FLOW_NAME?.trim() || "Fluxo Cleo";
const CLEO_WHATSAPP_DIGITS =
  process.env.CLEO_WHATSAPP_DIGITS?.trim()?.replace(/\D/g, "") || "551150284949";
const SITE_TRIGGER_KEY =
  process.env.CLEO_SITE_TRIGGER_KEY?.trim() || "_trigger:site-clienton";

const SITE_MESSAGE_TRIGGERS = [
  "quero conhecer o clienton",
  "quero conhecer",
  "ola quero conhecer",
  "olá quero conhecer",
];

async function resolveCleoFlowId(): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `SELECT id::text FROM flows
     WHERE tenant_id = $1::uuid AND lower(name) = lower($2)
     LIMIT 1`,
    [TENANT_ID, FLOW_NAME]
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`Fluxo "${FLOW_NAME}" não encontrado no tenant ${TENANT_ID}`);
  }
  return id;
}

async function resolveTwilioSourceKeyForDigits(digits: string): Promise<string> {
  const result = await pool.query<{ twilio_account_sid: string; display_phone: string }>(
    `SELECT ws.twilio_account_sid, wpn.display_phone_number AS display_phone
     FROM whatsapp_channel_accounts wca
     JOIN whatsapp_channel_secrets ws ON ws.channel_account_id = wca.id
     JOIN whatsapp_phone_numbers wpn ON wpn.channel_account_id = wca.id
     WHERE wca.tenant_id = $1::uuid
       AND wca.provider = $2
       AND ws.twilio_account_sid IS NOT NULL
       AND (
         regexp_replace(coalesce(wpn.display_phone_number, ''), '[^0-9]', '', 'g') = $3
         OR regexp_replace(wpn.phone_number_id, '[^0-9]', '', 'g') = $3
       )
     ORDER BY wca.created_at ASC
     LIMIT 1`,
    [TENANT_ID, WHATSAPP_PROVIDER_TWILIO, digits]
  );
  const row = result.rows[0];
  if (!row?.twilio_account_sid) {
    throw new Error(
      `Número Twilio ${digits} não encontrado no tenant. Cadastre o canal ou defina CLEO_INBOUND_SOURCE_KEY.`
    );
  }
  return whatsAppTwilioSourceKey(row.twilio_account_sid, digits);
}

async function upsertRoute(input: {
  label: string;
  sourceKey: string;
  flowId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const routes = await listInboundRoutes(TENANT_ID);
  const existing = routes.find(
    (r) =>
      r.source_type === WHATSAPP_PROVIDER_TWILIO &&
      r.source_key === input.sourceKey
  );

  const payload = {
    label: input.label,
    sourceType: WHATSAPP_PROVIDER_TWILIO,
    sourceKey: input.sourceKey,
    flowId: input.flowId,
    active: true,
    metadata: input.metadata ?? {},
  };

  if (existing) {
    await updateInboundRoute(TENANT_ID, existing.id, payload);
    console.log(`  inbound atualizada: ${input.label} (${existing.id})`);
    return;
  }

  try {
    const created = await createInboundRoute({ tenantId: TENANT_ID, ...payload });
    console.log(`  inbound criada: ${input.label} (${created.id})`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ROUTE_DUPLICATE") {
      console.warn(`  rota duplicada para ${input.sourceKey} — revise no admin`);
    } else {
      throw e;
    }
  }
}

async function main() {
  const flowId = await resolveCleoFlowId();
  const twilioSourceKey =
    process.env.CLEO_INBOUND_SOURCE_KEY?.trim() ||
    (await resolveTwilioSourceKeyForDigits(CLEO_WHATSAPP_DIGITS));

  console.log("Configurando rotas inbound Cleo...");
  console.log(`  tenant_id: ${TENANT_ID}`);
  console.log(`  flow_id:   ${flowId}`);
  console.log(`  twilio:    ${twilioSourceKey}`);

  await upsertRoute({
    label: "Cleo — WhatsApp padrão",
    sourceKey: twilioSourceKey,
    flowId,
  });

  await upsertRoute({
    label: "Cleo — Site (wa.me)",
    sourceKey: SITE_TRIGGER_KEY,
    flowId,
    metadata: {
      message_triggers: SITE_MESSAGE_TRIGGERS,
      match_any_source_key: true,
    },
  });

  console.log("");
  console.log("Rotas Cleo aplicadas.");
  console.log("Mensagens com 'Quero conhecer o ClientOn' vao para Cleo (limpa sessao Fox).");
  console.log("Demais mensagens no numero seguem a rota padrao (Cleo).");
  console.log("Fox continua so para gatilhos 'cadastrar-se'.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
