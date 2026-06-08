import { useEffect, useMemo, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

interface Flow {
  id: string;
  name: string;
}

type ReportView = "todas" | "tabulacoes" | "capturas" | "planilha" | "campanhas";

type CampaignReportRow = {
  campaignId: string;
  campaignName: string;
  flowId: string | null;
  dispatchedAt: string | null;
  phone: string;
  channelLabel: string | null;
  provider: string | null;
  deliveryStatus: string;
  firstReply: string | null;
  firstReplyAt: string | null;
  attendanceStatus: string;
  transferQueue: string | null;
  transferAt: string | null;
  protocolNumber: string | null;
  tabulacaoLabel: string | null;
};

type AggregateRow = {
  flowId: string;
  nodeId: string;
  questionKey: string;
  optionId: string;
  optionLabel: string;
  count: number;
};

type ResponseEvent = {
  id: string;
  flowId: string;
  nodeId: string;
  questionKey: string;
  answerType: string;
  variableName: string;
  rawValue?: string | null;
  selectedOptions: { id: string; label: string }[];
  createdAt: string;
};

type SpreadsheetColumn = {
  key: string;
  header: string;
  nodeId: string;
  questionKey: string;
  variableName: string;
  order: number;
};

type SpreadsheetRow = {
  contato: string;
  conversationId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  values: Record<string, string>;
};

type SpreadsheetReport = {
  flowId: string;
  columns: SpreadsheetColumn[];
  rows: SpreadsheetRow[];
};

const VIEW_META: Record<
  ReportView,
  { title: string; subtitle: string; questionKey?: string }
> = {
  todas: {
    title: "Relatórios de respostas",
    subtitle: "Todas as capturas e tabulações registradas nos fluxos",
  },
  tabulacoes: {
    title: "Tabulações",
    subtitle:
      "Desfechos registrados pelo node Tabulação (abandono, recusa, conclusão, etc.)",
    questionKey: "tabulacao",
  },
  capturas: {
    title: "Capturas de entrada",
    subtitle: "Respostas do node Capturar Entrada / Receber Mensagem (perguntas do fluxo)",
  },
  planilha: {
    title: "Planilha por contato",
    subtitle:
      "Uma linha por telefone, colunas na ordem do fluxo — exportável em CSV/Excel",
  },
  campanhas: {
    title: "Relatório de campanhas",
    subtitle:
      "Status dos disparos de template: entrega, resposta, encerramento e transferência",
  },
};

function labelForQuestion(
  row: { nodeId: string; questionKey: string },
  columnMap: Map<string, string>
): string {
  return columnMap.get(row.nodeId) || columnMap.get(row.questionKey) || row.questionKey;
}

export default function Reports() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState("");
  const [view, setView] = useState<ReportView>("planilha");
  const [aggregates, setAggregates] = useState<AggregateRow[]>([]);
  const [events, setEvents] = useState<ResponseEvent[]>([]);
  const [spreadsheet, setSpreadsheet] = useState<SpreadsheetReport | null>(null);
  const [columnLabels, setColumnLabels] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignRows, setCampaignRows] = useState<CampaignReportRow[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const meta = VIEW_META[view];

  useEffect(() => {
    api
      .get("/flows")
      .then((res) => setFlows(unwrapApiData<Flow[]>(res.data)))
      .catch(() => setFlows([]));
  }, []);

  const buildParams = () => {
    const params: Record<string, string | number> = {};
    if (flowId) params.flowId = flowId;
    if (meta.questionKey) params.questionKey = meta.questionKey;
    return params;
  };

  const loadColumnLabels = async (selectedFlowId: string) => {
    if (!selectedFlowId) {
      setColumnLabels(new Map());
      return;
    }
    try {
      const res = await api.get("/reports/flow-responses/spreadsheet", {
        params: { flowId: selectedFlowId, limit: 1 },
      });
      const report = unwrapApiData<SpreadsheetReport>(res.data);
      const map = new Map<string, string>();
      for (const col of report.columns) {
        map.set(col.nodeId, col.header);
        map.set(col.questionKey, col.header);
        map.set(col.variableName, col.header);
      }
      setColumnLabels(map);
    } catch {
      setColumnLabels(new Map());
    }
  };

  const loadSpreadsheet = () => {
    if (!flowId) {
      setError("Selecione um fluxo para gerar a planilha.");
      setSpreadsheet(null);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .get("/reports/flow-responses/spreadsheet", { params: { flowId, limit: 10000 } })
      .then((res) => setSpreadsheet(unwrapApiData<SpreadsheetReport>(res.data)))
      .catch((err) => {
        setError(getApiErrorMessage(err, "Não foi possível carregar a planilha."));
        setSpreadsheet(null);
      })
      .finally(() => setLoading(false));
  };

  const loadCampaignReport = () => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = {};
    if (flowId) params.flowId = flowId;
    if (dateFrom) params.from = new Date(dateFrom).toISOString();
    if (dateTo) params.to = new Date(`${dateTo}T23:59:59`).toISOString();
    api
      .get("/reports/campaigns", { params })
      .then((res) => {
        const data = unwrapApiData<{ rows: CampaignReportRow[] }>(res.data);
        setCampaignRows(data.rows ?? []);
      })
      .catch((err) => {
        setError(getApiErrorMessage(err, "Não foi possível carregar campanhas."));
        setCampaignRows([]);
      })
      .finally(() => setLoading(false));
  };

  const loadReports = () => {
    if (view === "planilha") {
      loadSpreadsheet();
      return;
    }
    if (view === "campanhas") {
      loadCampaignReport();
      return;
    }

    setLoading(true);
    setError(null);
    const params = buildParams();
    Promise.all([
      api.get("/reports/flow-responses/aggregates", { params }),
      api.get("/reports/flow-responses", { params: { ...params, limit: 200 } }),
    ])
      .then(([aggRes, evRes]) => {
        let aggRows = unwrapApiData<AggregateRow[]>(aggRes.data);
        let evRows = unwrapApiData<ResponseEvent[]>(evRes.data);

        if (view === "capturas") {
          aggRows = aggRows.filter((r) => r.questionKey !== "tabulacao");
          evRows = evRows.filter((ev) => ev.questionKey !== "tabulacao");
        }

        setAggregates(aggRows);
        setEvents(evRows);
      })
      .catch((err) => {
        setError(getApiErrorMessage(err, "Não foi possível carregar relatórios."));
        setAggregates([]);
        setEvents([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (flowId) void loadColumnLabels(flowId);
    else setColumnLabels(new Map());
  }, [flowId]);

  useEffect(() => {
    loadReports();
  }, [flowId, view]);

  const downloadCampaignExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const params: Record<string, string> = { format: "csv" };
      if (flowId) params.flowId = flowId;
      if (dateFrom) params.from = new Date(dateFrom).toISOString();
      if (dateTo) params.to = new Date(`${dateTo}T23:59:59`).toISOString();
      const res = await api.get("/reports/campaigns", {
        params,
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "campanhas-relatorio.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível exportar campanhas."));
    } finally {
      setExporting(false);
    }
  };

  const downloadExport = async (format: "csv" | "xlsx") => {
    if (!flowId) {
      setError("Selecione um fluxo para exportar.");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const res = await api.get("/reports/flow-responses/export", {
        params: { flowId, format },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const flowName =
        flows.find((f) => f.id === flowId)?.name?.replace(/[^\w\-]+/g, "-") || "fluxo";
      anchor.href = url;
      anchor.download = `${flowName}-respostas.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(getApiErrorMessage(err, "Não foi possível exportar a planilha."));
    } finally {
      setExporting(false);
    }
  };

  const totalCount = aggregates.reduce((sum, row) => sum + row.count, 0);

  const previewRows = useMemo(
    () => spreadsheet?.rows.slice(0, 100) ?? [],
    [spreadsheet]
  );

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{meta.title}</h1>
        <p className="text-sm text-gray-300 mt-1">{meta.subtitle}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(VIEW_META) as ReportView[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === key
                ? "bg-teal-600 text-white"
                : "bg-[#1a2332] text-gray-300 border border-gray-600 hover:border-teal-500"
            }`}
          >
            {key === "todas"
              ? "Todas"
              : key === "tabulacoes"
                ? "Tabulações"
                : key === "capturas"
                  ? "Capturas"
                  : key === "campanhas"
                    ? "Campanhas"
                    : "Planilha"}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm text-gray-300 mb-1">
            Fluxo {view === "planilha" && <span className="text-teal-400">*</span>}
          </label>
          <select
            value={flowId}
            onChange={(e) => setFlowId(e.target.value)}
            className="px-4 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white min-w-[240px]"
          >
            <option value="">
              {view === "planilha" ? "Selecione um fluxo…" : "Todos os fluxos"}
            </option>
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        {view === "campanhas" && (
          <>
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
          </>
        )}
        <button
          type="button"
          onClick={loadReports}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? "Carregando..." : "Atualizar"}
        </button>
        {view === "campanhas" && (
          <button
            type="button"
            onClick={() => void downloadCampaignExport()}
            disabled={exporting}
            className="px-4 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white hover:border-teal-500 disabled:opacity-50"
          >
            {exporting ? "Exportando..." : "Exportar CSV"}
          </button>
        )}
        {view === "planilha" && (
          <>
            <button
              type="button"
              onClick={() => downloadExport("csv")}
              disabled={exporting || !flowId}
              className="px-4 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white hover:border-teal-500 disabled:opacity-50"
            >
              {exporting ? "Exportando..." : "Exportar CSV"}
            </button>
            <button
              type="button"
              onClick={() => downloadExport("xlsx")}
              disabled={exporting || !flowId}
              className="px-4 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white hover:border-teal-500 disabled:opacity-50"
            >
              Exportar Excel
            </button>
          </>
        )}
      </div>

      {view === "tabulacoes" && aggregates.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-fuchsia-900/20 border border-fuchsia-700/40 text-fuchsia-100 text-sm">
          Total de tabulações no período filtrado:{" "}
          <strong className="text-white">{totalCount}</strong>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-600 text-red-200 text-sm">
          {error}
        </div>
      )}

      {view === "planilha" && (
        <section className="mb-10">
          {!flowId ? (
            <p className="text-gray-400 text-sm">
              Selecione um fluxo (ex.: Fluxo Fox Pesquisas) para ver a planilha com uma
              coluna por pergunta, na ordem do fluxo.
            </p>
          ) : !spreadsheet || spreadsheet.columns.length === 0 ? (
            <p className="text-gray-400 text-sm">
              {loading
                ? "Carregando planilha…"
                : "Nenhuma resposta registrada para este fluxo ainda."}
            </p>
          ) : (
            <>
              <p className="text-gray-400 text-sm mb-3">
                {spreadsheet.rows.length} contato(s) · {spreadsheet.columns.length}{" "}
                coluna(s) na ordem do fluxo
                {spreadsheet.rows.length > 100 ? " · exibindo os 100 primeiros" : ""}
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-sm text-left min-w-max">
                  <thead className="bg-[#1a2332] text-gray-300">
                    <tr>
                      <th className="px-3 py-2 sticky left-0 bg-[#1a2332]">Contato</th>
                      {spreadsheet.columns.map((col) => (
                        <th key={col.key} className="px-3 py-2 whitespace-nowrap">
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-gray-200 divide-y divide-gray-700">
                    {previewRows.map((row) => (
                      <tr key={`${row.contato}-${row.completedAt}`} className="bg-[#0f1419]">
                        <td className="px-3 py-2 font-medium text-teal-300 sticky left-0 bg-[#0f1419]">
                          {row.contato}
                        </td>
                        {spreadsheet.columns.map((col) => (
                          <td key={col.key} className="px-3 py-2 max-w-xs truncate">
                            {row.values[col.key] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {view === "campanhas" && (
        <section className="mb-10">
          {campaignRows.length === 0 ? (
            <p className="text-gray-400 text-sm">
              {loading ? "Carregando…" : "Nenhum disparo de campanha no período."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm text-left min-w-max">
                <thead className="bg-[#1a2332] text-gray-300">
                  <tr>
                    <th className="px-3 py-2">Campanha</th>
                    <th className="px-3 py-2">Telefone</th>
                    <th className="px-3 py-2">Canal</th>
                    <th className="px-3 py-2">Entrega</th>
                    <th className="px-3 py-2">1ª resposta</th>
                    <th className="px-3 py-2">Atendimento</th>
                    <th className="px-3 py-2">Fila transfer.</th>
                    <th className="px-3 py-2">Protocolo</th>
                  </tr>
                </thead>
                <tbody className="text-gray-200 divide-y divide-gray-700">
                  {campaignRows.map((row, i) => (
                    <tr key={`${row.campaignId}-${row.phone}-${i}`} className="bg-[#0f1419]">
                      <td className="px-3 py-2">{row.campaignName}</td>
                      <td className="px-3 py-2 text-teal-300">{row.phone}</td>
                      <td className="px-3 py-2">{row.channelLabel || row.provider || "—"}</td>
                      <td className="px-3 py-2">{row.deliveryStatus}</td>
                      <td className="px-3 py-2 max-w-xs truncate">
                        {row.firstReply
                          ? `${row.firstReply}${row.firstReplyAt ? ` (${new Date(row.firstReplyAt).toLocaleString("pt-BR")})` : ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">{row.attendanceStatus}</td>
                      <td className="px-3 py-2">
                        {row.transferQueue
                          ? `${row.transferQueue}${row.transferAt ? ` · ${new Date(row.transferAt).toLocaleString("pt-BR")}` : ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">{row.protocolNumber || row.tabulacaoLabel || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {view !== "planilha" && view !== "campanhas" && (
        <>
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-white mb-3">
              {view === "tabulacoes" ? "Contagem por tabulação" : "Contagem por opção"}
            </h2>
            {aggregates.length === 0 ? (
              <p className="text-gray-400 text-sm">
                {view === "tabulacoes"
                  ? "Nenhuma tabulação registrada ainda. Use o node Tabulação nos fluxos."
                  : "Nenhuma resposta registrada ainda."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#1a2332] text-gray-300">
                    <tr>
                      {view !== "tabulacoes" && <th className="px-4 py-2">Pergunta</th>}
                      <th className="px-4 py-2">
                        {view === "tabulacoes" ? "Tabulação" : "Opção"}
                      </th>
                      <th className="px-4 py-2">Quantidade</th>
                      {view === "todas" && <th className="px-4 py-2">%</th>}
                    </tr>
                  </thead>
                  <tbody className="text-gray-200 divide-y divide-gray-700">
                    {aggregates.map((row, i) => (
                      <tr key={`${row.questionKey}-${row.optionId}-${i}`} className="bg-[#0f1419]">
                        {view !== "tabulacoes" && (
                          <td className="px-4 py-2 text-gray-300">
                            {labelForQuestion(row, columnLabels)}
                          </td>
                        )}
                        <td className="px-4 py-2">
                          {row.optionLabel}{" "}
                          <span className="text-gray-500 text-xs">({row.optionId})</span>
                        </td>
                        <td className="px-4 py-2 font-semibold text-teal-400">{row.count}</td>
                        {view === "todas" && (
                          <td className="px-4 py-2 text-gray-400">
                            {totalCount > 0
                              ? `${((row.count / totalCount) * 100).toFixed(1)}%`
                              : "—"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Últimos registros</h2>
            {events.length === 0 ? (
              <p className="text-gray-400 text-sm">Sem eventos recentes.</p>
            ) : (
              <div className="space-y-2">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-lg bg-[#1a2332] border border-gray-700 text-sm text-gray-200"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-teal-300">
                        {view === "tabulacoes"
                          ? ev.selectedOptions?.[0]?.label || ev.questionKey
                          : labelForQuestion(ev, columnLabels)}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {new Date(ev.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-gray-400 text-xs mt-1">
                      {ev.answerType} · {ev.variableName}
                    </p>
                    <p className="mt-1">
                      {ev.selectedOptions?.length
                        ? ev.selectedOptions.map((o) => o.label).join(", ")
                        : ev.rawValue || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
