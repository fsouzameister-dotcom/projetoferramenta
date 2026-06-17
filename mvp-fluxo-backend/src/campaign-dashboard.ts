import { pool } from "./db";
import { ensureCampaignSchema } from "./campaigns";

export type CampaignDashboardMetrics = {
  total: number;
  pending: number;
  skipped: number;
  failed: number;
  dispatched: number;
  sent: number;
  delivered: number;
  read: number;
  responded: number;
};

export type CampaignDashboardByCampaign = {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  metrics: CampaignDashboardMetrics;
};

export type CampaignDashboardTimelinePoint = {
  date: string;
  dispatched: number;
  responded: number;
};

export type CampaignDashboardResult = {
  summary: CampaignDashboardMetrics;
  byCampaign: CampaignDashboardByCampaign[];
  timeline: CampaignDashboardTimelinePoint[];
};

type MetricsRow = {
  total: string;
  pending: string;
  skipped: string;
  failed: string;
  dispatched: string;
  sent: string;
  delivered: string;
  read: string;
  responded: string;
};

function mapMetricsRow(row: MetricsRow | undefined): CampaignDashboardMetrics {
  if (!row) {
    return {
      total: 0,
      pending: 0,
      skipped: 0,
      failed: 0,
      dispatched: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      responded: 0,
    };
  }
  return {
    total: Number(row.total) || 0,
    pending: Number(row.pending) || 0,
    skipped: Number(row.skipped) || 0,
    failed: Number(row.failed) || 0,
    dispatched: Number(row.dispatched) || 0,
    sent: Number(row.sent) || 0,
    delivered: Number(row.delivered) || 0,
    read: Number(row.read) || 0,
    responded: Number(row.responded) || 0,
  };
}

const METRICS_SELECT = `
  count(*)::text AS total,
  count(*) FILTER (WHERE mr.status IN ('pending', 'sending'))::text AS pending,
  count(*) FILTER (WHERE mr.status = 'skipped')::text AS skipped,
  count(*) FILTER (WHERE mr.status = 'failed')::text AS failed,
  count(*) FILTER (WHERE mr.sent_at IS NOT NULL)::text AS dispatched,
  count(*) FILTER (WHERE mr.status IN ('sent', 'delivered', 'read', 'responded'))::text AS sent,
  count(*) FILTER (WHERE mr.status IN ('delivered', 'read', 'responded'))::text AS delivered,
  count(*) FILTER (WHERE mr.status IN ('read', 'responded'))::text AS read,
  count(*) FILTER (WHERE mr.status = 'responded' OR mr.first_reply_at IS NOT NULL)::text AS responded
`;

function buildFilters(input: {
  tenantId: string;
  campaignId?: string;
  from?: string;
  to?: string;
}): { where: string; params: unknown[] } {
  const params: unknown[] = [input.tenantId];
  const clauses = ["mr.tenant_id = $1::uuid"];
  let n = 2;

  if (input.campaignId?.trim()) {
    clauses.push(`mr.mailing_id = $${n++}::uuid`);
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

  return { where: clauses.join(" AND "), params };
}

export async function buildCampaignDashboard(input: {
  tenantId: string;
  campaignId?: string;
  from?: string;
  to?: string;
}): Promise<CampaignDashboardResult> {
  await ensureCampaignSchema();
  const { where, params } = buildFilters(input);

  const summaryResult = await pool.query<MetricsRow>(
    `SELECT ${METRICS_SELECT}
     FROM mailing_recipients mr
     WHERE ${where}`,
    params
  );

  const byCampaignResult = await pool.query<
    MetricsRow & {
      campaign_id: string;
      campaign_name: string;
      campaign_status: string;
    }
  >(
    `SELECT m.id::text AS campaign_id,
            m.name AS campaign_name,
            m.status AS campaign_status,
            ${METRICS_SELECT}
     FROM mailing_recipients mr
     JOIN mailings m ON m.id = mr.mailing_id
     WHERE ${where}
     GROUP BY m.id, m.name, m.status
     ORDER BY m.created_at DESC`,
    params
  );

  const dispatchedTimeline = await pool.query<{ day: string; n: string }>(
    `SELECT to_char(mr.sent_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
            count(*)::text AS n
     FROM mailing_recipients mr
     WHERE ${where} AND mr.sent_at IS NOT NULL
     GROUP BY 1
     ORDER BY 1`,
    params
  );

  const respondedTimeline = await pool.query<{ day: string; n: string }>(
    `SELECT to_char(mr.first_reply_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
            count(*)::text AS n
     FROM mailing_recipients mr
     WHERE ${where} AND mr.first_reply_at IS NOT NULL
     GROUP BY 1
     ORDER BY 1`,
    params
  );

  const timelineMap = new Map<string, CampaignDashboardTimelinePoint>();
  for (const row of dispatchedTimeline.rows) {
    timelineMap.set(row.day, {
      date: row.day,
      dispatched: Number(row.n) || 0,
      responded: 0,
    });
  }
  for (const row of respondedTimeline.rows) {
    const existing = timelineMap.get(row.day) ?? {
      date: row.day,
      dispatched: 0,
      responded: 0,
    };
    existing.responded = Number(row.n) || 0;
    timelineMap.set(row.day, existing);
  }

  return {
    summary: mapMetricsRow(summaryResult.rows[0]),
    byCampaign: byCampaignResult.rows.map((row) => ({
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      campaignStatus: row.campaign_status,
      metrics: mapMetricsRow(row),
    })),
    timeline: [...timelineMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
