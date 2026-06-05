import { listNodesByFlow } from "./nodes";
import {
  buildReportColumnsFromNodes,
  type FlowSpreadsheetColumn,
} from "./flow-report-columns";
import { listFlowResponseEvents, type FlowResponseEventRecord } from "./flow-response-events";

export type { FlowSpreadsheetColumn } from "./flow-report-columns";
export { flowSpreadsheetToCsv } from "./flow-report-columns";

export type FlowSpreadsheetRow = {
  contato: string;
  conversationId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  values: Record<string, string>;
};

export type FlowSpreadsheetReport = {
  flowId: string;
  columns: FlowSpreadsheetColumn[];
  rows: FlowSpreadsheetRow[];
};

function phoneDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

function formatEventValue(event: FlowResponseEventRecord): string {
  if (event.selectedOptions?.length) {
    return event.selectedOptions.map((o) => o.label || o.id).join(", ");
  }
  return (event.rawValue ?? "").trim();
}

function columnKeyForEvent(
  event: FlowResponseEventRecord,
  columnsByNodeId: Map<string, FlowSpreadsheetColumn>
): string | null {
  const col = columnsByNodeId.get(event.nodeId);
  if (col) return col.key;
  return `${event.nodeId}:${event.questionKey}`;
}

export async function buildFlowSpreadsheetReport(input: {
  tenantId: string;
  flowId: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<FlowSpreadsheetReport> {
  const nodes = await listNodesByFlow(input.flowId, input.tenantId);
  const columns = buildReportColumnsFromNodes(nodes);
  const columnsByNodeId = new Map(columns.map((c) => [c.nodeId, c]));

  const events = await listFlowResponseEvents({
    tenantId: input.tenantId,
    flowId: input.flowId,
    from: input.from,
    to: input.to,
    limit: input.limit ?? 10000,
  });

  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const groups = new Map<
    string,
    {
      contato: string;
      conversationId: string | null;
      startedAt: string | null;
      completedAt: string | null;
      values: Record<string, string[]>;
    }
  >();

  for (const event of sorted) {
    const phoneRaw = event.phone?.trim() || "";
    const digits = phoneRaw ? phoneDigitsOnly(phoneRaw) : "";
    const groupKey = digits || event.conversationId || event.sessionId || event.id;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        contato: digits || phoneRaw || groupKey,
        conversationId: event.conversationId,
        startedAt: event.createdAt,
        completedAt: event.createdAt,
        values: {},
      });
    }

    const group = groups.get(groupKey)!;
    group.completedAt = event.createdAt;
    if (!group.conversationId && event.conversationId) {
      group.conversationId = event.conversationId;
    }

    const colKey = columnKeyForEvent(event, columnsByNodeId);
    if (!colKey) continue;

    const value = formatEventValue(event);
    if (!value) continue;

    if (!group.values[colKey]) group.values[colKey] = [];
    const list = group.values[colKey]!;
    if (!list.includes(value)) {
      list.push(value);
    }
  }

  const rows: FlowSpreadsheetRow[] = [...groups.values()]
    .map((g) => {
      const values: Record<string, string> = {};
      for (const [key, parts] of Object.entries(g.values)) {
        values[key] = parts.join(" | ");
      }
      return {
        contato: g.contato,
        conversationId: g.conversationId,
        startedAt: g.startedAt,
        completedAt: g.completedAt,
        values,
      };
    })
    .sort((a, b) => {
      const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return tb - ta;
    });

  return {
    flowId: input.flowId,
    columns,
    rows,
  };
}
