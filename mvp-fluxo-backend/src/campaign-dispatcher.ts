import {
  finalizeCampaignIfDone,
  getCampaign,
  listActiveSendingCampaigns,
  pickNextPendingRecipient,
  sendCampaignRecipient,
} from "./campaigns";

const lastSentAt = new Map<string, number>();

function campaignThrottleKey(tenantId: string, campaignId: string): string {
  return `${tenantId}:${campaignId}`;
}

export async function processCampaignDispatchTick(): Promise<void> {
  const active = await listActiveSendingCampaigns();
  const now = Date.now();

  for (const item of active) {
    const key = campaignThrottleKey(item.tenantId, item.campaignId);
    const last = lastSentAt.get(key) ?? 0;
    const waitMs = item.intervalSeconds * 1000;
    if (now - last < waitMs) continue;

    const recipientId = await pickNextPendingRecipient(item.tenantId, item.campaignId);
    if (!recipientId) {
      await finalizeCampaignIfDone(item.tenantId, item.campaignId);
      continue;
    }

    const campaign = await getCampaign(item.tenantId, item.campaignId);
    if (!campaign || campaign.status !== "sending") continue;

    await sendCampaignRecipient({
      tenantId: item.tenantId,
      campaign,
      recipientId,
    });
    lastSentAt.set(key, Date.now());
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startCampaignDispatcher(): void {
  if (timer) return;
  timer = setInterval(() => {
    void processCampaignDispatchTick().catch((err) => {
      console.warn("[campaign-dispatcher]", err instanceof Error ? err.message : err);
    });
  }, 1000);
}
