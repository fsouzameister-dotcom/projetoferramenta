import { pool } from "./db";
import { encryptSecret, decryptSecret } from "./secrets";

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS server_whatsapp_settings (
        id smallint PRIMARY KEY,
        meta_webhook_verify_token_encrypted text,
        meta_app_secret_encrypted text,
        whatsapp_skip_signature_verify boolean NOT NULL DEFAULT false,
        twilio_skip_signature_verify boolean NOT NULL DEFAULT false,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT server_whatsapp_settings_singleton CHECK (id = 1)
      )
    `);
    await client.query(`
      ALTER TABLE server_whatsapp_settings
      ADD COLUMN IF NOT EXISTS meta_app_id text
    `);
    await client.query(`
      ALTER TABLE server_whatsapp_settings
      ADD COLUMN IF NOT EXISTS meta_embedded_signup_config_id text
    `);
    await client.query(`
      INSERT INTO server_whatsapp_settings (id) VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `);
    schemaReady = true;
  } finally {
    client.release();
  }
}

export type ServerWhatsAppSettingsPublic = {
  meta: {
    webhookVerifyTokenConfigured: boolean;
    appSecretConfigured: boolean;
    appId: string | null;
    embeddedSignupConfigId: string | null;
  };
  flags: {
    whatsappSkipSignatureVerify: boolean;
    twilioSkipSignatureVerify: boolean;
  };
};

export async function getServerWhatsAppSettingsPublic(): Promise<ServerWhatsAppSettingsPublic> {
  await ensureSchema();
  const r = await pool.query<{
    meta_webhook_verify_token_encrypted: string | null;
    meta_app_secret_encrypted: string | null;
    meta_app_id: string | null;
    meta_embedded_signup_config_id: string | null;
    whatsapp_skip_signature_verify: boolean;
    twilio_skip_signature_verify: boolean;
  }>(
    `SELECT meta_webhook_verify_token_encrypted, meta_app_secret_encrypted,
            meta_app_id, meta_embedded_signup_config_id,
            whatsapp_skip_signature_verify, twilio_skip_signature_verify
     FROM server_whatsapp_settings WHERE id = 1`
  );
  const row = r.rows[0];
  const appId =
    row?.meta_app_id?.trim() ||
    process.env.META_APP_ID?.trim() ||
    process.env.WHATSAPP_APP_ID?.trim() ||
    null;
  const configId =
    row?.meta_embedded_signup_config_id?.trim() ||
    process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() ||
    null;
  return {
    meta: {
      webhookVerifyTokenConfigured: Boolean(row?.meta_webhook_verify_token_encrypted?.trim()),
      appSecretConfigured: Boolean(
        row?.meta_app_secret_encrypted?.trim() ||
          process.env.WHATSAPP_APP_SECRET?.trim() ||
          process.env.META_APP_SECRET?.trim()
      ),
      appId: appId || null,
      embeddedSignupConfigId: configId || null,
    },
    flags: {
      whatsappSkipSignatureVerify: row?.whatsapp_skip_signature_verify ?? false,
      twilioSkipSignatureVerify: row?.twilio_skip_signature_verify ?? false,
    },
  };
}

export type UpsertServerWhatsAppSettingsInput = {
  metaWebhookVerifyToken?: string;
  metaAppSecret?: string;
  metaAppId?: string;
  metaEmbeddedSignupConfigId?: string;
  whatsappSkipSignatureVerify?: boolean;
  twilioSkipSignatureVerify?: boolean;
};

export async function upsertServerWhatsAppSettings(
  input: UpsertServerWhatsAppSettingsInput
): Promise<void> {
  await ensureSchema();
  const v = input.metaWebhookVerifyToken?.trim();
  const s = input.metaAppSecret?.trim();
  const appId = input.metaAppId?.trim();
  const configId = input.metaEmbeddedSignupConfigId?.trim();
  const wSkip = input.whatsappSkipSignatureVerify;
  const tSkip = input.twilioSkipSignatureVerify;

  const fragments: string[] = [];
  const params: unknown[] = [];
  let n = 1;
  if (v !== undefined && v.length > 0) {
    fragments.push(`meta_webhook_verify_token_encrypted = $${n++}`);
    params.push(encryptSecret(v));
  }
  if (s !== undefined && s.length > 0) {
    fragments.push(`meta_app_secret_encrypted = $${n++}`);
    params.push(encryptSecret(s));
  }
  if (appId !== undefined) {
    fragments.push(`meta_app_id = $${n++}`);
    params.push(appId.length > 0 ? appId : null);
  }
  if (configId !== undefined) {
    fragments.push(`meta_embedded_signup_config_id = $${n++}`);
    params.push(configId.length > 0 ? configId : null);
  }
  if (wSkip !== undefined) {
    fragments.push(`whatsapp_skip_signature_verify = $${n++}`);
    params.push(wSkip);
  }
  if (tSkip !== undefined) {
    fragments.push(`twilio_skip_signature_verify = $${n++}`);
    params.push(tSkip);
  }
  if (fragments.length === 0) {
    return;
  }
  fragments.push("updated_at = now()");
  params.push(1);
  await pool.query(
    `UPDATE server_whatsapp_settings SET ${fragments.join(", ")} WHERE id = $${n}`,
    params
  );
}

/** Valor efetivo: banco (cifrado) senão variável de ambiente. */
export async function resolveMetaWebhookVerifyToken(): Promise<string | undefined> {
  await ensureSchema();
  const r = await pool.query<{ enc: string | null }>(
    `SELECT meta_webhook_verify_token_encrypted AS enc FROM server_whatsapp_settings WHERE id = 1`
  );
  const enc = r.rows[0]?.enc?.trim();
  if (enc) {
    try {
      const plain = decryptSecret(enc).trim();
      if (plain) return plain;
    } catch {
      /* ignora payload inválido e cai no .env */
    }
  }
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
}

export async function resolveMetaAppSecret(): Promise<string | undefined> {
  await ensureSchema();
  const r = await pool.query<{ enc: string | null }>(
    `SELECT meta_app_secret_encrypted AS enc FROM server_whatsapp_settings WHERE id = 1`
  );
  const enc = r.rows[0]?.enc?.trim();
  if (enc) {
    try {
      const plain = decryptSecret(enc).trim();
      if (plain) return plain;
    } catch {
      /* */
    }
  }
  return (
    process.env.WHATSAPP_APP_SECRET?.trim() ||
    process.env.META_APP_SECRET?.trim()
  );
}

export async function resolveMetaAppId(): Promise<string | undefined> {
  await ensureSchema();
  const r = await pool.query<{ v: string | null }>(
    `SELECT meta_app_id AS v FROM server_whatsapp_settings WHERE id = 1`
  );
  const fromDb = r.rows[0]?.v?.trim();
  if (fromDb) return fromDb;
  return process.env.META_APP_ID?.trim() || process.env.WHATSAPP_APP_ID?.trim();
}

export async function resolveMetaEmbeddedSignupConfigId(): Promise<string | undefined> {
  await ensureSchema();
  const r = await pool.query<{ v: string | null }>(
    `SELECT meta_embedded_signup_config_id AS v FROM server_whatsapp_settings WHERE id = 1`
  );
  const fromDb = r.rows[0]?.v?.trim();
  if (fromDb) return fromDb;
  return process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim();
}

export async function resolveShouldSkipWhatsAppSignatureVerify(): Promise<boolean> {
  await ensureSchema();
  const r = await pool.query<{ f: boolean }>(
    `SELECT whatsapp_skip_signature_verify AS f FROM server_whatsapp_settings WHERE id = 1`
  );
  if (r.rows[0]?.f === true) return true;
  return process.env.WHATSAPP_SKIP_SIGNATURE_VERIFY === "true";
}

export async function resolveShouldSkipTwilioSignatureVerify(): Promise<boolean> {
  await ensureSchema();
  const r = await pool.query<{ f: boolean }>(
    `SELECT twilio_skip_signature_verify AS f FROM server_whatsapp_settings WHERE id = 1`
  );
  if (r.rows[0]?.f === true) return true;
  return process.env.TWILIO_SKIP_SIGNATURE_VERIFY === "true";
}
