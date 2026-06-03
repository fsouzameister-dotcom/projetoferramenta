import { pool } from "./db";

export type TenantServiceSettings = {
  tenantId: string;
  closureMessageTemplate: string;
  returnLookupDays: number;
  updatedAt: string;
};

const DEFAULT_CLOSURE_TEMPLATE =
  "Seu atendimento foi encerrado. Protocolo: {{protocolo}}. Obrigado pelo contato.";

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_service_settings (
        tenant_id uuid PRIMARY KEY,
        closure_message_template text NOT NULL,
        return_lookup_days integer NOT NULL DEFAULT 7,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

export async function getTenantServiceSettings(
  tenantId: string
): Promise<TenantServiceSettings> {
  await ensureSchema();
  const result = await pool.query(
    `SELECT tenant_id, closure_message_template, return_lookup_days, updated_at
     FROM tenant_service_settings WHERE tenant_id = $1::uuid`,
    [tenantId]
  );
  if (!result.rows[0]) {
    return {
      tenantId,
      closureMessageTemplate: DEFAULT_CLOSURE_TEMPLATE,
      returnLookupDays: 7,
      updatedAt: new Date().toISOString(),
    };
  }
  const row = result.rows[0];
  return {
    tenantId: String(row.tenant_id),
    closureMessageTemplate: String(row.closure_message_template),
    returnLookupDays: Number(row.return_lookup_days) || 7,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

export async function upsertTenantServiceSettings(input: {
  tenantId: string;
  closureMessageTemplate?: string;
  returnLookupDays?: number;
}): Promise<TenantServiceSettings> {
  await ensureSchema();
  const current = await getTenantServiceSettings(input.tenantId);
  const template =
    input.closureMessageTemplate?.trim() || current.closureMessageTemplate;
  const days =
    input.returnLookupDays !== undefined
      ? Math.min(365, Math.max(1, Math.floor(input.returnLookupDays)))
      : current.returnLookupDays;

  await pool.query(
    `INSERT INTO tenant_service_settings (tenant_id, closure_message_template, return_lookup_days, updated_at)
     VALUES ($1::uuid, $2, $3, now())
     ON CONFLICT (tenant_id) DO UPDATE SET
       closure_message_template = EXCLUDED.closure_message_template,
       return_lookup_days = EXCLUDED.return_lookup_days,
       updated_at = now()`,
    [input.tenantId, template, days]
  );
  return getTenantServiceSettings(input.tenantId);
}

export function renderClosureMessageTemplate(
  template: string,
  vars: { protocolo: string; nome_cliente?: string; resumo_tabulacao?: string }
): string {
  return template
    .replace(/\{\{protocolo\}\}/gi, vars.protocolo)
    .replace(/\{\{nome_cliente\}\}/gi, vars.nome_cliente?.trim() || "Cliente")
    .replace(/\{\{resumo_tabulacao\}\}/gi, vars.resumo_tabulacao?.trim() || "")
    .replace(/\{\{data\}\}/gi, new Date().toLocaleDateString("pt-BR"));
}
