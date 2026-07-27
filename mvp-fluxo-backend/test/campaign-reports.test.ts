import assert from "node:assert";
import { describe, test } from "node:test";

import {
  campaignReportToCsv,
  type CampaignReportRow,
} from "../src/campaign-report-format";
import { classifyCampaignFailure } from "../src/campaign-failure";

describe("campaign-reports", () => {
  test("campaignReportToCsv gera cabeçalho e linha com escape", () => {
    const rows: CampaignReportRow[] = [
      {
        campaignId: "c1",
        campaignName: 'Campanha "Fox"',
        flowId: "flow-1",
        dispatchedAt: "2026-06-08T12:00:00Z",
        phone: "+5511992007226",
        channelLabel: "Twilio",
        provider: "twilio_whatsapp",
        deliveryStatus: "sent",
        firstReply: "Sim",
        firstReplyAt: "2026-06-08T12:05:00Z",
        attendanceStatus: "em_fluxo",
        transferQueue: null,
        transferAt: null,
        protocolNumber: "CLI-001",
        tabulacaoLabel: null,
        errorCode: null,
        errorDescription: null,
        failureKind: null,
        failureLabel: null,
        failureDetail: null,
        retrySafe: null,
        alreadyBilled: null,
      },
    ];
    const csv = campaignReportToCsv(rows);
    const lines = csv.split("\n");
    assert.strictEqual(lines.length, 2);
    assert.ok(lines[0]?.includes("Campanha"));
    assert.ok(lines[0]?.includes("Tipo falha"));
    assert.ok(lines[1]?.includes('Campanha ""Fox""'));
    assert.ok(lines[1]?.includes("+5511992007226"));
  });
});

describe("campaign-failure", () => {
  test("classifica delivery_failed com SID como cobrado e não seguro", () => {
    const info = classifyCampaignFailure({
      status: "failed",
      providerMessageId: "MM123",
      errorCode: "30003",
      errorDescription: "Unreachable destination",
    });
    assert.equal(info?.failureKind, "delivery_failed");
    assert.equal(info?.retrySafe, false);
    assert.equal(info?.alreadyBilled, true);
  });

  test("classifica api_rejected sem SID como retry seguro", () => {
    const info = classifyCampaignFailure({
      status: "failed",
      providerMessageId: null,
      errorCode: "21614",
      errorDescription: "Invalid mobile number",
    });
    assert.equal(info?.failureKind, "api_rejected");
    assert.equal(info?.retrySafe, true);
    assert.equal(info?.alreadyBilled, false);
  });
});
