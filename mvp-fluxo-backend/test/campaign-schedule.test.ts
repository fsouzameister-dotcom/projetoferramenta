import assert from "node:assert";
import { describe, test } from "node:test";

import { parseCampaignScheduledAt } from "../src/campaign-schedule";

describe("campaign-schedule", () => {
  test("rejeita vazio e data inválida", () => {
    assert.throws(() => parseCampaignScheduledAt(""), /CAMPAIGN_INVALID_SCHEDULE/);
    assert.throws(() => parseCampaignScheduledAt("não-é-data"), /CAMPAIGN_INVALID_SCHEDULE/);
  });

  test("rejeita horário no passado ou imediato demais", () => {
    const now = new Date("2026-08-18T18:00:00.000Z");
    assert.throws(
      () => parseCampaignScheduledAt("2026-08-18T17:00:00.000Z", now),
      /CAMPAIGN_INVALID_SCHEDULE/
    );
    assert.throws(
      () => parseCampaignScheduledAt("2026-08-18T18:00:10.000Z", now),
      /CAMPAIGN_INVALID_SCHEDULE/
    );
  });

  test("aceita ISO pelo menos 30s à frente", () => {
    const now = new Date("2026-08-18T18:00:00.000Z");
    const parsed = parseCampaignScheduledAt("2026-08-18T18:01:00.000Z", now);
    assert.equal(parsed.toISOString(), "2026-08-18T18:01:00.000Z");
  });
});
