import { useEffect, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

interface Flow {
  id: string;
  name: string;
}

type ReportView = "todas" | "tabulacoes" | "capturas";

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
  selectedOptions: { id: string; label: string }[];
  createdAt: string;
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
};

export default function Reports() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState("");
  const [view, setView] = useState<ReportView>("tabulacoes");
  const [aggregates, setAggregates] = useState<AggregateRow[]>([]);
  const [events, setEvents] = useState<ResponseEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const loadReports = () => {
    setLoading(true);
    setError(null);
    const params = buildParams();
    Promise.all([
      api.get("/reports/flow-responses/aggregates", { params }),
      api.get("/reports/flow-responses", { params: { ...params, limit: 50 } }),
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
    loadReports();
  }, [flowId, view]);

  const totalCount = aggregates.reduce((sum, row) => sum + row.count, 0);

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
            {key === "todas" ? "Todas" : key === "tabulacoes" ? "Tabulações" : "Capturas"}
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm text-gray-300 mb-1">Fluxo</label>
          <select
            value={flowId}
            onChange={(e) => setFlowId(e.target.value)}
            className="px-4 py-2 rounded-lg bg-[#1a2332] border border-gray-600 text-white min-w-[240px]"
          >
            <option value="">Todos os fluxos</option>
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={loadReports}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? "Carregando..." : "Atualizar"}
        </button>
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
                  {view !== "tabulacoes" && <th className="px-4 py-2">Chave</th>}
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
                      <td className="px-4 py-2 text-gray-400">{row.questionKey}</td>
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
                      : ev.questionKey}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {new Date(ev.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                <p className="text-gray-400 text-xs mt-1">
                  {ev.answerType} · {ev.variableName}
                  {view !== "tabulacoes" ? ` · ${ev.questionKey}` : ""}
                </p>
                <p className="mt-1">
                  {ev.selectedOptions?.length
                    ? ev.selectedOptions.map((o) => o.label).join(", ")
                    : "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
