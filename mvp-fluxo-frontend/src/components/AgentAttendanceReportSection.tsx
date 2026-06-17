import { useCallback, useEffect, useMemo, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

type UserOption = { id: string; name: string; email: string };
type CampaignOption = { id: string; name: string };
type QueueOption = { key: string; label: string };

type SummaryData = {
  summary: {
    total: number;
    open: number;
    closed: number;
    avgTmeSec: number | null;
    avgTmaSec: number | null;
  };
  byAgent: Array<{
    agentUserId: string | null;
    agentName: string;
    total: number;
    open: number;
    closed: number;
    avgTmeSec: number | null;
    avgTmaSec: number | null;
  }>;
  byQueue: Array<{ queueKey: string; total: number; open: number; closed: number }>;
  timeline: Array<{ date: string; total: number; closed: number }>;
};

type DetailRow = {
  conversationId: string;
  protocolNumber: string | null;
  contactName: string;
  phone: string;
  agentUserId: string | null;
  agentName: string;
  closedByName: string | null;
  queueKey: string | null;
  campaignName: string | null;
  tabulacaoLabel: string | null;
  openedAt: string;
  closedAt: string | null;
  firstHumanReplyAt: string | null;
  tmeSec: number | null;
  tmaSec: number | null;
};

function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-[#1a2332] p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-white mt-1 tabular-nums">{value}</p>
      {sub ? <p className="text-xs text-gray-500 mt-1">{sub}</p> : null}
    </div>
  );
}

export default function AgentAttendanceReportSection({
  mode,
  onError,
  onLoading,
}: {
  mode: "summary" | "detail";
  onError: (msg: string | null) => void;
  onLoading: (loading: boolean) => void;
}) {
  const [dateField, setDateField] = useState<"opened" | "closed">("opened");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [agentUserId, setAgentUserId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [queueKey, setQueueKey] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/users").catch(() => ({ data: { data: [] } })),
      api.get("/admin/campaigns").catch(() => ({ data: { data: [] } })),
      api.get("/queues").catch(() => ({ data: { data: [] } })),
    ]).then(([usersRes, campaignsRes, queuesRes]) => {
      setUsers(unwrapApiData<UserOption[]>(usersRes.data) ?? []);
      const campaignList = unwrapApiData<Array<{ id: string; name: string }>>(campaignsRes.data) ?? [];
      setCampaigns(campaignList.map((c) => ({ id: c.id, name: c.name })));
      const queueList =
        unwrapApiData<Array<{ key: string; label: string }>>(queuesRes.data) ?? [];
      setQueues(queueList.map((q) => ({ key: q.key, label: q.label })));
    });
  }, []);

  const buildParams = useCallback(() => {
    const params: Record<string, string> = { dateField };
    if (dateFrom) params.from = new Date(dateFrom).toISOString();
    if (dateTo) params.to = new Date(`${dateTo}T23:59:59`).toISOString();
    if (agentUserId) params.agentUserId = agentUserId;
    if (campaignId) params.campaignId = campaignId;
    if (queueKey) params.queueKey = queueKey;
    return params;
  }, [agentUserId, campaignId, dateField, dateFrom, dateTo, queueKey]);

  const loadData = useCallback(() => {
    onLoading(true);
    onError(null);
    const params = buildParams();
    const request =
      mode === "summary"
        ? api.get("/reports/agent-attendance/summary", { params })
        : api.get("/reports/agent-attendance/detail", { params: { ...params, limit: "5000" } });

    request
      .then((res) => {
        if (mode === "summary") {
          setSummary(unwrapApiData<SummaryData>(res.data));
          setDetailRows([]);
        } else {
          const data = unwrapApiData<{ rows: DetailRow[] }>(res.data);
          setDetailRows(data.rows ?? []);
          setSummary(null);
        }
      })
      .catch((err) => {
        onError(
          getApiErrorMessage(
            err,
            mode === "summary"
              ? "Não foi possível carregar o resumo de atendimentos."
              : "Não foi possível carregar o detalhado de atendimentos."
          )
        );
        setSummary(null);
        setDetailRows([]);
      })
      .finally(() => onLoading(false));
  }, [buildParams, mode, onError, onLoading]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const downloadCsv = async () => {
    setExporting(true);
    onError(null);
    try {
      const res = await api.get("/reports/agent-attendance/detail", {
        params: { ...buildParams(), format: "csv", limit: "10000" },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "atendimentos-detalhado.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      onError(getApiErrorMessage(err, "Não foi possível exportar o relatório."));
    } finally {
      setExporting(false);
    }
  };

  const maxTimeline = useMemo(
    () => Math.max(...(summary?.timeline.map((t) => t.total) ?? [0]), 1),
    [summary]
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm text-gray-300 mb-1">Filtrar por data de</label>
          <select
            value={dateField}
            onChange={(e) => setDateField(e.target.value as "opened" | "closed")}
            className="px-3 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white min-w-[160px]"
          >
            <option value="opened">Abertura</option>
            <option value="closed">Encerramento</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-300 mb-1">De</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-300 mb-1">Até</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-300 mb-1">Agente</label>
          <select
            value={agentUserId}
            onChange={(e) => setAgentUserId(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white min-w-[200px]"
          >
            <option value="">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-300 mb-1">Campanha</label>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white min-w-[200px]"
          >
            <option value="">Todas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-300 mb-1">Fila</label>
          <select
            value={queueKey}
            onChange={(e) => setQueueKey(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white min-w-[160px]"
          >
            <option value="">Todas</option>
            {queues.map((q) => (
              <option key={q.key} value={q.key}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-500"
        >
          Atualizar
        </button>
        {mode === "detail" && (
          <button
            type="button"
            onClick={downloadCsv}
            disabled={exporting}
            className="px-4 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white hover:border-teal-500 disabled:opacity-50"
          >
            {exporting ? "Exportando…" : "Exportar CSV"}
          </button>
        )}
      </div>

      {mode === "summary" && summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            <MetricCard label="Atendimentos" value={summary.summary.total} />
            <MetricCard label="Em aberto" value={summary.summary.open} />
            <MetricCard label="Encerrados" value={summary.summary.closed} />
            <MetricCard
              label="TME médio"
              value={formatDuration(summary.summary.avgTmeSec)}
              sub="até 1ª resposta humana"
            />
            <MetricCard
              label="TMA médio"
              value={formatDuration(summary.summary.avgTmaSec)}
              sub="inclui em aberto até agora"
            />
          </div>

          {summary.timeline.length > 0 && (
            <section className="mb-8">
              <h2 className="text-lg font-semibold text-white mb-3">Por dia (abertura)</h2>
              <div className="space-y-2">
                {summary.timeline.map((point) => (
                  <div key={point.date}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">
                        {new Date(`${point.date}T12:00:00`).toLocaleDateString("pt-BR")}
                      </span>
                      <span className="text-gray-400 tabular-nums">
                        {point.total} total · {point.closed} encerrados
                      </span>
                    </div>
                    <div className="h-6 rounded bg-zinc-800 border border-zinc-700 overflow-hidden">
                      <div
                        className="h-full bg-teal-600"
                        style={{
                          width: `${Math.max(4, Math.round((point.total / maxTimeline) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-3">Por agente</h2>
            {summary.byAgent.length === 0 ? (
              <p className="text-gray-400 text-sm">Nenhum atendimento no período.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-sm text-left min-w-max">
                  <thead className="bg-[#1a2332] text-gray-300">
                    <tr>
                      <th className="px-3 py-2">Agente</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Abertos</th>
                      <th className="px-3 py-2">Encerrados</th>
                      <th className="px-3 py-2">TME médio</th>
                      <th className="px-3 py-2">TMA médio</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-200 divide-y divide-gray-700">
                    {summary.byAgent.map((row) => (
                      <tr key={`${row.agentUserId ?? "x"}-${row.agentName}`} className="bg-[#0f1419]">
                        <td className="px-3 py-2">
                          {row.agentName}
                          {row.agentUserId ? (
                            <span className="block text-xs text-gray-500">{row.agentUserId}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 font-semibold text-teal-400">{row.total}</td>
                        <td className="px-3 py-2">{row.open}</td>
                        <td className="px-3 py-2">{row.closed}</td>
                        <td className="px-3 py-2">{formatDuration(row.avgTmeSec)}</td>
                        <td className="px-3 py-2">{formatDuration(row.avgTmaSec)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Por fila</h2>
            {summary.byQueue.length === 0 ? (
              <p className="text-gray-400 text-sm">Nenhuma fila no período.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#1a2332] text-gray-300">
                    <tr>
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Abertos</th>
                      <th className="px-3 py-2">Encerrados</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-200 divide-y divide-gray-700">
                    {summary.byQueue.map((row) => (
                      <tr key={row.queueKey} className="bg-[#0f1419]">
                        <td className="px-3 py-2">{row.queueKey}</td>
                        <td className="px-3 py-2 font-semibold text-teal-400">{row.total}</td>
                        <td className="px-3 py-2">{row.open}</td>
                        <td className="px-3 py-2">{row.closed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {mode === "detail" && (
        <section>
          {detailRows.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhum atendimento no período.</p>
          ) : (
            <>
              <p className="text-gray-400 text-sm mb-3">
                {detailRows.length} conversa(s) · TMA de em aberto calculado até a consulta
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-sm text-left min-w-max">
                  <thead className="bg-[#1a2332] text-gray-300">
                    <tr>
                      <th className="px-3 py-2">Protocolo</th>
                      <th className="px-3 py-2">Contato</th>
                      <th className="px-3 py-2">Agente</th>
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">Campanha origem</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Tabulação</th>
                      <th className="px-3 py-2">Abertura</th>
                      <th className="px-3 py-2">Encerramento</th>
                      <th className="px-3 py-2">TME</th>
                      <th className="px-3 py-2">TMA</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-200 divide-y divide-gray-700">
                    {detailRows.map((row) => (
                      <tr key={row.conversationId} className="bg-[#0f1419]">
                        <td className="px-3 py-2">{row.protocolNumber || "—"}</td>
                        <td className="px-3 py-2">
                          <span className="text-teal-300">{row.contactName}</span>
                          <span className="block text-xs text-gray-500">{row.phone}</span>
                        </td>
                        <td className="px-3 py-2">
                          {row.agentName}
                          {row.agentUserId ? (
                            <span className="block text-xs text-gray-500">{row.agentUserId}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{row.queueKey || "—"}</td>
                        <td className="px-3 py-2">{row.campaignName || "—"}</td>
                        <td className="px-3 py-2">
                          {row.closedAt ? (
                            <span className="text-gray-300">Encerrado</span>
                          ) : (
                            <span className="text-amber-300">Em aberto</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{row.tabulacaoLabel || "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatDateTime(row.openedAt)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatDateTime(row.closedAt)}
                        </td>
                        <td className="px-3 py-2">{formatDuration(row.tmeSec)}</td>
                        <td className="px-3 py-2">{formatDuration(row.tmaSec)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
