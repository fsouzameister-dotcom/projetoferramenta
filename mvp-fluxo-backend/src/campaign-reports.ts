import { pool } from "./db";
import { ensureCampaignSchema } from "./campaigns";
import {
  campaignReportToCsv,
  type CampaignReportRow,
} from "./campaign-report-format";

export type { CampaignReportRow } from "./campaign-report-format";
export { campaignReportToCsv } from "./campaign-report-format";

function deriveAttendanceStatus(input: {
  lifecycle_status: string | null;
  status: string | null;
  flow_handoff: boolean;
}): string {
  if (input.flow_handoff) return "transferido";
  if (input.lifecycle_status === "closed_manual" || input.lifecycle_status === "closed_window") {
    return "encerrado";
  }
  if (input.status === "em_andamento") return "em_atendimento";
  if (input.status === "em_espera") return "em_atendimento";
  return "em_fluxo";
}

export async function buildCampaignReport(input: {
  tenantId: string;
  flowId?: string;
  from?: string;
  to?: string;
  campaignId?: string;
}): Promise<CampaignReportRow[]> {
  await ensureCampaignSchema();
  const params: unknown[] = [input.tenantId];
  const clauses = ["mr.tenant_id = $1::uuid", "mr.sent_at IS NOT NULL"];
  let n = 2;

  if (input.flowId?.trim()) {
    clauses.push(`m.flow_id = $${n++}::uuid`);
    params.push(input.flowId.trim());
  }
  if (input.campaignId?.trim()) {
    clauses.push(`m.id = $${n++}::uuid`);
    params.push(input.campaignId.trim());
  }
  if (input.from?.trim()) {
    clauses.push(`mr.sent_at >= $${n++}::timestamptz`);
    params.push(input.from.trim());
  }
  if (input.to?.trim()) {
    clauses.push(`mr.sent_at <= $${n++}::timestamptz`);
    params.push(input.to.trim());
  }

  const result = await pool.query<{
    campaign_id: string;
    campaign_name: string;
    flow_id: string | null;
    dispatched_at: string | null;
    phone: string;
    channel_label: string | null;
    provider: string | null;
    delivery_status: string;
    first_reply: string | null;
    first_reply_at: string | null;
    lifecycle_status: string | null;
    conv_status: string | null;
    flow_handoff: boolean;
    transfer_queue: string | null;
    transfer_at: string | null;
    protocol_number: string | null;
    tabulacao_label: string | null;
  }>(
    `SELECT m.id::text AS campaign_id,
            m.name AS campaign_name,
            m.flow_id::text AS flow_id,
            mr.sent_at::text AS dispatched_at,
            mr.phone_e164 AS phone,
            m.metadata->>'channelLabel' AS channel_label,
            m.metadata->>'provider' AS provider,
            mr.status AS delivery_status,
            mr.first_reply_text AS first_reply,
            mr.first_reply_at::text AS first_reply_at,
            c.lifecycle_status,
            c.status AS conv_status,
            COALESCE((c.metadata->>'flowHandoff')::boolean, false) AS flow_handoff,
            c.metadata->>'queue' AS transfer_queue,
            c.metadata->>'handoffAt' AS transfer_at,
            c.protocol_number,
            c.tabulacao_label
     FROM mailing_recipients mr
     JOIN mailings m ON m.id = mr.mailing_id
     LEFT JOIN agent_conversations c ON c.id = mr.conversation_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY mr.sent_at DESC`,
    params
  );

  return result.rows.map((r) => ({
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    flowId: r.flow_id,
    dispatchedAt: r.dispatched_at,
    phone: r.phone,
    channelLabel: r.channel_label,
    provider: r.provider,
    deliveryStatus: r.delivery_status,
    firstReply: r.first_reply,
    firstReplyAt: r.first_reply_at,
    attendanceStatus: deriveAttendanceStatus({
      lifecycle_status: r.lifecycle_status,
      status: r.conv_status,
      flow_handoff: r.flow_handoff,
    }),
    transferQueue: r.flow_handoff ? r.transfer_queue : null,
    transferAt: r.flow_handoff ? r.transfer_at : null,
    protocolNumber: r.protocol_number,
    tabulacaoLabel: r.tabulacao_label,
  }));
}

