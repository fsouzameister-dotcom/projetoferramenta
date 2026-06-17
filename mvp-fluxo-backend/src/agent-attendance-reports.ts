import { pool } from "./db";
import { ensureCampaignSchema } from "./campaigns";

export type AgentAttendanceDateField = "opened" | "closed";

export type AgentAttendanceSummaryRow = {
  agentUserId: string | null;
  agentName: string;
  total: number;
  open: number;
  closed: number;
  avgTmeSec: number | null;
  avgTmaSec: number | null;
};

export type AgentAttendanceQueueRow = {
  queueKey: string;
  total: number;
  open: number;
  closed: number;
};

export type AgentAttendanceTimelinePoint = {
  date: string;
  total: number;
  closed: number;
};

export type AgentAttendanceSummaryResult = {
  summary: {
    total: number;
    open: number;
    closed: number;
    avgTmeSec: number | null;
    avgTmaSec: number | null;
  };
  byAgent: AgentAttendanceSummaryRow[];
  byQueue: AgentAttendanceQueueRow[];
  timeline: AgentAttendanceTimelinePoint[];
};

export type AgentAttendanceDetailRow = {
  conversationId: string;
  protocolNumber: string | null;
  contactName: string;
  phone: string;
  agentUserId: string | null;
  agentName: string;
  closedByUserId: string | null;
  closedByName: string | null;
  queueKey: string | null;
  campaignId: string | null;
  campaignName: string | null;
  status: string;
  lifecycleStatus: string;
  tabulacaoLabel: string | null;
  openedAt: string;
  closedAt: string | null;
  firstHumanReplyAt: string | null;
  tmeSec: number | null;
  tmaSec: number | null;
};

type AttendanceBaseRow = {
  conversation_id: string;
  protocol_number: string | null;
  contact_name: string;
  phone: string;
  assigned_user_id: string | null;
  agent_name: string | null;
  closed_by_user_id: string | null;
  closed_by_name: string | null;
  closed_by: string | null;
  queue_key: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  status: string;
  lifecycle_status: string;
  tabulacao_label: string | null;
  opened_at: string;
  closed_at: string | null;
  first_human_reply_at: string | null;
  tme_sec: string | null;
  tma_sec: string | null;
};

const HUMAN_CONV_CTE = `
  human_conv AS (
    SELECT
      ac.id,
      ac.tenant_id,
      ac.contact_name,
      ac.phone,
      ac.status,
      ac.lifecycle_status,
      ac.closed_at,
      ac.closed_by,
      ac.assigned_user_id,
      ac.closed_by_user_id,
      ac.protocol_number,
      ac.tabulacao_label,
      ac.metadata,
      ac.created_at,
      COALESCE(
        NULLIF(ac.metadata->>'handoffAt', '')::timestamptz,
        ac.created_at
      ) AS human_started_at
    FROM agent_conversations ac
    WHERE ac.tenant_id = $1::uuid
      AND COALESCE(ac.metadata->>'bot_only', 'false') <> 'true'
  ),
  first_reply AS (
    SELECT
      am.conversation_id,
      MIN(am.created_at) AS first_human_reply_at
    FROM agent_messages am
    INNER JOIN human_conv hc ON hc.id = am.conversation_id
    WHERE am.tenant_id = $1::uuid
      AND am.direction = 'out'
      AND am.sender_name IS NOT NULL
      AND btrim(am.sender_name) <> ''
    GROUP BY am.conversation_id
  ),
  campaign_link AS (
    SELECT DISTINCT ON (mr.conversation_id)
      mr.conversation_id,
      m.id::text AS campaign_id,
      m.name AS campaign_name
    FROM mailing_recipients mr
    INNER JOIN mailings m ON m.id = mr.mailing_id
    WHERE mr.tenant_id = $1::uuid
      AND mr.conversation_id IS NOT NULL
    ORDER BY mr.conversation_id, mr.sent_at DESC NULLS LAST
  ),
  attendance AS (
    SELECT
      hc.id AS conversation_id,
      hc.protocol_number,
      hc.contact_name,
      hc.phone,
      hc.assigned_user_id,
      COALESCE(ua.name, ua.email, 'Sem agente') AS agent_name,
      hc.closed_by_user_id,
      uc.name AS closed_by_name,
      hc.closed_by,
      NULLIF(hc.metadata->>'queue', '') AS queue_key,
      cl.campaign_id,
      cl.campaign_name,
      hc.status,
      hc.lifecycle_status,
      hc.tabulacao_label,
      hc.human_started_at AS opened_at,
      hc.closed_at,
      fr.first_human_reply_at,
      EXTRACT(EPOCH FROM (fr.first_human_reply_at - hc.human_started_at))::bigint AS tme_sec,
      EXTRACT(
        EPOCH FROM (
          COALESCE(hc.closed_at, now()) - COALESCE(fr.first_human_reply_at, hc.human_started_at)
        )
      )::bigint AS tma_sec
    FROM human_conv hc
    LEFT JOIN first_reply fr ON fr.conversation_id = hc.id
    LEFT JOIN campaign_link cl ON cl.conversation_id = hc.id
    LEFT JOIN users ua ON ua.id = hc.assigned_user_id
    LEFT JOIN users uc ON uc.id = hc.closed_by_user_id
  )
`;

function buildAttendanceFilters(input: {
  tenantId: string;
  dateField?: AgentAttendanceDateField;
  from?: string;
  to?: string;
  agentUserId?: string;
  campaignId?: string;
  queueKey?: string;
}): { where: string; params: unknown[] } {
  const params: unknown[] = [input.tenantId];
  const clauses: string[] = [];
  let n = 2;

  const dateField = input.dateField === "closed" ? "closed" : "opened";
  if (input.from?.trim()) {
    if (dateField === "closed") {
      clauses.push(`a.closed_at IS NOT NULL AND a.closed_at >= $${n++}::timestamptz`);
    } else {
      clauses.push(`a.opened_at >= $${n++}::timestamptz`);
    }
    params.push(input.from.trim());
  }
  if (input.to?.trim()) {
    if (dateField === "closed") {
      clauses.push(`a.closed_at IS NOT NULL AND a.closed_at <= $${n++}::timestamptz`);
    } else {
      clauses.push(`a.opened_at <= $${n++}::timestamptz`);
    }
    params.push(input.to.trim());
  }
  if (input.agentUserId?.trim()) {
    clauses.push(`a.assigned_user_id = $${n++}::uuid`);
    params.push(input.agentUserId.trim());
  }
  if (input.campaignId?.trim()) {
    clauses.push(`a.campaign_id = $${n++}`);
    params.push(input.campaignId.trim());
  }
  if (input.queueKey?.trim()) {
    clauses.push(`COALESCE(a.queue_key, '') = $${n++}`);
    params.push(input.queueKey.trim());
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

function mapDetailRow(row: AttendanceBaseRow): AgentAttendanceDetailRow {
  return {
    conversationId: row.conversation_id,
    protocolNumber: row.protocol_number,
    contactName: row.contact_name,
    phone: row.phone,
    agentUserId: row.assigned_user_id,
    agentName: row.agent_name?.trim() || row.closed_by?.trim() || "Sem agente",
    closedByUserId: row.closed_by_user_id,
    closedByName: row.closed_by_name,
    queueKey: row.queue_key,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    status: row.status,
    lifecycleStatus: row.lifecycle_status,
    tabulacaoLabel: row.tabulacao_label,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    firstHumanReplyAt: row.first_human_reply_at,
    tmeSec: row.tme_sec != null ? Number(row.tme_sec) : null,
    tmaSec: row.tma_sec != null ? Number(row.tma_sec) : null,
  };
}

function avgOrNull(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export async function buildAgentAttendanceSummary(input: {
  tenantId: string;
  dateField?: AgentAttendanceDateField;
  from?: string;
  to?: string;
  agentUserId?: string;
  campaignId?: string;
  queueKey?: string;
}): Promise<AgentAttendanceSummaryResult> {
  await ensureCampaignSchema();
  const { where, params } = buildAttendanceFilters(input);

  const detailResult = await pool.query<AttendanceBaseRow>(
    `WITH ${HUMAN_CONV_CTE}
     SELECT a.*
     FROM attendance a
     ${where}
     ORDER BY a.opened_at DESC`,
    params
  );

  const rows = detailResult.rows.map(mapDetailRow);

  const byAgentMap = new Map<string, AgentAttendanceSummaryRow>();
  const byQueueMap = new Map<string, AgentAttendanceQueueRow>();
  const timelineMap = new Map<string, AgentAttendanceTimelinePoint>();

  for (const row of rows) {
    const agentKey = row.agentUserId ?? `legacy:${row.agentName}`;
    const agent = byAgentMap.get(agentKey) ?? {
      agentUserId: row.agentUserId,
      agentName: row.agentName,
      total: 0,
      open: 0,
      closed: 0,
      avgTmeSec: null,
      avgTmaSec: null,
    };
    agent.total += 1;
    if (row.closedAt) agent.closed += 1;
    else agent.open += 1;
    byAgentMap.set(agentKey, agent);

    const queueKey = row.queueKey?.trim() || "(sem fila)";
    const queue = byQueueMap.get(queueKey) ?? {
      queueKey,
      total: 0,
      open: 0,
      closed: 0,
    };
    queue.total += 1;
    if (row.closedAt) queue.closed += 1;
    else queue.open += 1;
    byQueueMap.set(queueKey, queue);

    const day = row.openedAt.slice(0, 10);
    const point = timelineMap.get(day) ?? { date: day, total: 0, closed: 0 };
    point.total += 1;
    if (row.closedAt) point.closed += 1;
    timelineMap.set(day, point);
  }

  const byAgent = [...byAgentMap.values()]
    .map((agent) => {
      const agentRows = rows.filter(
        (r) =>
          (r.agentUserId && r.agentUserId === agent.agentUserId) ||
          (!r.agentUserId && r.agentName === agent.agentName)
      );
      return {
        ...agent,
        avgTmeSec: avgOrNull(agentRows.map((r) => r.tmeSec)),
        avgTmaSec: avgOrNull(agentRows.map((r) => r.tmaSec)),
      };
    })
    .sort((a, b) => b.total - a.total);

  const byQueue = [...byQueueMap.values()].sort((a, b) => b.total - a.total);
  const timeline = [...timelineMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    summary: {
      total: rows.length,
      open: rows.filter((r) => !r.closedAt).length,
      closed: rows.filter((r) => Boolean(r.closedAt)).length,
      avgTmeSec: avgOrNull(rows.map((r) => r.tmeSec)),
      avgTmaSec: avgOrNull(rows.map((r) => r.tmaSec)),
    },
    byAgent,
    byQueue,
    timeline,
  };
}

export async function buildAgentAttendanceDetail(input: {
  tenantId: string;
  dateField?: AgentAttendanceDateField;
  from?: string;
  to?: string;
  agentUserId?: string;
  campaignId?: string;
  queueKey?: string;
  limit?: number;
}): Promise<AgentAttendanceDetailRow[]> {
  await ensureCampaignSchema();
  const { where, params } = buildAttendanceFilters(input);
  const limit = Math.min(Math.max(input.limit ?? 5000, 1), 10000);
  params.push(limit);

  const result = await pool.query<AttendanceBaseRow>(
    `WITH ${HUMAN_CONV_CTE}
     SELECT a.*
     FROM attendance a
     ${where}
     ORDER BY a.opened_at DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.map(mapDetailRow);
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function formatDurationSec(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

export function agentAttendanceDetailToCsv(rows: AgentAttendanceDetailRow[]): string {
  const header = [
    "Protocolo",
    "Contato",
    "Telefone",
    "Agente",
    "ID Agente",
    "Encerrado por",
    "ID Encerramento",
    "Fila",
    "Campanha",
    "Status",
    "Tabulação",
    "Abertura",
    "1ª resposta humana",
    "Encerramento",
    "TME",
    "TMA",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        csvEscape(r.protocolNumber),
        csvEscape(r.contactName),
        csvEscape(r.phone),
        csvEscape(r.agentName),
        csvEscape(r.agentUserId),
        csvEscape(r.closedByName || r.closedByUserId),
        csvEscape(r.closedByUserId),
        csvEscape(r.queueKey),
        csvEscape(r.campaignName),
        csvEscape(r.closedAt ? "encerrado" : "em aberto"),
        csvEscape(r.tabulacaoLabel),
        csvEscape(r.openedAt),
        csvEscape(r.firstHumanReplyAt),
        csvEscape(r.closedAt),
        csvEscape(formatDurationSec(r.tmeSec)),
        csvEscape(formatDurationSec(r.tmaSec)),
      ].join(",")
    ),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}
