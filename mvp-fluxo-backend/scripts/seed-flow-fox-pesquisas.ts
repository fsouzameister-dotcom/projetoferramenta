/**
 * Fluxo Fox Pesquisas — cadastro painelista com validações e roteamento "Cadastrar-se".
 *
 * Uso:
 *   npm run seed:fox-flow
 */
import "dotenv/config";
import { pool } from "../src/db";
import { createInboundRoute, listInboundRoutes, updateInboundRoute } from "../src/inbound-routes";
import { WHATSAPP_PROVIDER_TWILIO } from "../src/whatsapp-channels";
import {
  FOX_HID_CHAVE,
  buildFoxFlowNodes,
} from "./data/fox-flow-nodes";

const TENANT_ID =
  process.env.DEFAULT_LOGIN_TENANT_ID?.trim() ||
  "00000000-0000-4000-8000-000000000001";
const FLOW_NAME = process.env.SEED_FOX_FLOW_NAME?.trim() || "Fluxo Fox Pesquisas";
const TWILIO_SOURCE_KEY =
  process.env.FOX_INBOUND_SOURCE_KEY?.trim() || "551150284949";

async function fetchFoxHidFormulario(): Promise<string> {
  const env = process.env.FOX_HID_FORMULARIO?.trim();
  if (env) return env;
  const res = await fetch(
    "https://www.foxcadastro.com.br/public/componentes/cadastro_pf/model/validaFormulario.php",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ chave: FOX_HID_CHAVE.replace(/_/g, "") }),
    }
  );
  const text = (await res.text()).trim();
  if (!text || text === "0" || text === "1") {
    console.warn("validaFormulario retornou", text, "— use FOX_HID_FORMULARIO no .env");
    return process.env.FOX_HID_FORMULARIO_FALLBACK?.trim() || "2";
  }
  return text;
}

async function resolveFlowId(client: import("pg").PoolClient): Promise<string> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM flows
     WHERE tenant_id = $1::uuid AND lower(name) = lower($2)
     LIMIT 1`,
    [TENANT_ID, FLOW_NAME]
  );
  if (r.rows[0]?.id) return r.rows[0].id;
  const created = await client.query<{ id: string }>(
    `INSERT INTO flows (tenant_id, name, channel, is_active)
     VALUES ($1::uuid, $2, 'whatsapp', true)
     RETURNING id::text`,
    [TENANT_ID, FLOW_NAME]
  );
  return created.rows[0].id;
}

async function upsertFoxInboundRoute(flowId: string) {
  const routes = await listInboundRoutes(TENANT_ID);
  const existing = routes.find(
    (r) =>
      r.flow_id === flowId ||
      (Array.isArray(r.metadata?.message_triggers) &&
        (r.metadata.message_triggers as string[]).some((t) =>
          t.toLowerCase().includes("cadastrar")
        ))
  );

  const payload = {
    label: "Fox — Cadastrar-se",
    sourceType: WHATSAPP_PROVIDER_TWILIO,
    sourceKey: TWILIO_SOURCE_KEY,
    flowId,
    active: true,
    metadata: {
      message_triggers: ["cadastrar-se", "cadastrar se", "cadastrar"],
      match_any_source_key: true,
    },
  };

  if (existing) {
    await updateInboundRoute(TENANT_ID, existing.id, payload);
    console.log(`  inbound_route: atualizada (${existing.id})`);
    return;
  }

  try {
    const created = await createInboundRoute({ tenantId: TENANT_ID, ...payload });
    console.log(`  inbound_route: criada (${created.id})`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "ROUTE_DUPLICATE") {
      console.warn("Rota inbound duplicada — ajuste manualmente no admin.");
    } else {
      throw e;
    }
  }
}

async function main() {
  const foxHidFormulario = await fetchFoxHidFormulario();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const flowId = await resolveFlowId(client);
    await client.query(`DELETE FROM nodes WHERE flow_id = $1::uuid`, [flowId]);

    const nodes = buildFoxFlowNodes(foxHidFormulario);
    for (const node of nodes) {
      await client.query(
        `INSERT INTO nodes (id, flow_id, type, name, config, is_start)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6)`,
        [
          node.id,
          flowId,
          node.type,
          node.name,
          JSON.stringify(node.config),
          node.is_start ?? false,
        ]
      );
    }

    await client.query(
      `UPDATE flows
       SET is_active = true,
           channel = 'whatsapp'
       WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [flowId, TENANT_ID]
    );

    await client.query("COMMIT");
    await upsertFoxInboundRoute(flowId);

    console.log("Fluxo Fox Pesquisas aplicado com sucesso.");
    console.log(`  tenant_id:        ${TENANT_ID}`);
    console.log(`  flow_id:          ${flowId}`);
    console.log(`  fox_hid_formulario: ${foxHidFormulario}`);
    console.log(`  nodes:            ${nodes.length}`);
    console.log("");
    console.log('Gatilho inbound: primeira mensagem "Cadastrar-se" (ou similar).');
    console.log("Demais mensagens seguem a rota padrão do número (ex.: Cleo).");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
