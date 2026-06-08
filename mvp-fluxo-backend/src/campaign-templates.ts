import { pool } from "./db";
import { decryptSecret } from "./secrets";
import {
  WHATSAPP_PROVIDER_CLOUD,
  WHATSAPP_PROVIDER_TWILIO,
} from "./whatsapp-channels";
import { fetchMetaMessageTemplates } from "./whatsapp-cloud-api";
import { fetchTwilioContentTemplates } from "./whatsapp-twilio-api";

export type CampaignTemplateOption = {
  provider: typeof WHATSAPP_PROVIDER_TWILIO | typeof WHATSAPP_PROVIDER_CLOUD;
  templateId: string;
  displayName: string;
  language: string | null;
  variables: string[];
  bodyPreview: string;
  contentSid?: string;
  templateName?: string;
};

export async function listCampaignTemplatesForChannel(
  tenantId: string,
  channelAccountId: string
): Promise<CampaignTemplateOption[]> {
  const row = await pool.query<{
    provider: string;
    waba_id: string | null;
    access_token_encrypted: string | null;
    twilio_account_sid: string | null;
    twilio_auth_token_encrypted: string | null;
  }>(
    `SELECT wca.provider,
            ws.waba_id,
            ws.access_token_encrypted,
            ws.twilio_account_sid,
            ws.twilio_auth_token_encrypted
     FROM whatsapp_channel_accounts wca
     JOIN whatsapp_channel_secrets ws ON ws.channel_account_id = wca.id
     WHERE wca.tenant_id = $1::uuid AND wca.id = $2::uuid`,
    [tenantId, channelAccountId]
  );
  const channel = row.rows[0];
  if (!channel) return [];

  if (channel.provider === WHATSAPP_PROVIDER_TWILIO) {
    if (!channel.twilio_account_sid || !channel.twilio_auth_token_encrypted) return [];
    const items = await fetchTwilioContentTemplates({
      accountSid: channel.twilio_account_sid,
      authToken: decryptSecret(channel.twilio_auth_token_encrypted),
    });
    return items.map((t) => ({
      provider: WHATSAPP_PROVIDER_TWILIO,
      templateId: t.contentSid,
      displayName: t.friendlyName,
      language: t.language,
      variables: t.variables,
      bodyPreview: t.bodyPreview,
      contentSid: t.contentSid,
    }));
  }

  if (channel.provider === WHATSAPP_PROVIDER_CLOUD) {
    if (!channel.waba_id || !channel.access_token_encrypted) return [];
    const items = await fetchMetaMessageTemplates({
      wabaId: channel.waba_id,
      accessToken: decryptSecret(channel.access_token_encrypted),
    });
    return items.map((t) => ({
      provider: WHATSAPP_PROVIDER_CLOUD,
      templateId: `${t.templateName}|${t.language}`,
      displayName: t.templateName,
      language: t.language,
      variables: t.variables,
      bodyPreview: t.bodyPreview,
      templateName: t.templateName,
    }));
  }

  return [];
}

export function renderTemplatePreview(
  bodyPreview: string,
  columnMapping: Record<string, string>,
  sampleRow: Record<string, string>
): string {
  return bodyPreview.replace(/\{\{(\w+)\}\}/g, (_, slot: string) => {
    const column = columnMapping[slot];
    if (!column) return `{{${slot}}}`;
    const value = sampleRow[column];
    return value != null && String(value).trim() ? String(value).trim() : `{{${slot}}}`;
  });
}
