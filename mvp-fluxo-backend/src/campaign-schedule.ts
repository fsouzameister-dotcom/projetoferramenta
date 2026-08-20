/** Agendamento de campanha: horário absoluto (timestamptz). */

export const CAMPAIGN_SCHEDULE_MIN_LEAD_MS = 30_000;

export function parseCampaignScheduledAt(raw: string, now = new Date()): Date {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("CAMPAIGN_INVALID_SCHEDULE");
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("CAMPAIGN_INVALID_SCHEDULE");
  }
  if (parsed.getTime() < now.getTime() + CAMPAIGN_SCHEDULE_MIN_LEAD_MS) {
    throw new Error("CAMPAIGN_INVALID_SCHEDULE");
  }
  return parsed;
}

export function campaignScheduledAtIso(date: Date): string {
  return date.toISOString();
}
