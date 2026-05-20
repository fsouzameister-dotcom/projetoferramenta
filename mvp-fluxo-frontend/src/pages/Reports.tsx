import { useEffect, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

interface Flow {
  id: string;
  name: string;
}

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

export default function Reports() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState("");
  const [aggregates, setAggregates] = useState<AggregateRow[]>([]);
  const [events, setEvents] = useState<ResponseEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/flows")
      .then((res) => setFlows(unwrapApiData<Flow[]>(res.data)))
      .catch(() => setFlows([]));
  }, []);

  const loadReports = () => {
    setLoading(true);
    setError(null);
    const params = flowId ? { flowId } : {};
    Promise.all([
      api.get("/reports/flow-responses/aggregates", { params }),
      api.get("/reports/flow-responses", { params: { ...params, limit: 50 } }),
    ])
      .then(([aggRes, evRes]) => {
        setAggregates(unwrapApiData<AggregateRow[]>(aggRes.data));
        setEvents(unwrapApiData<ResponseEvent[]>(evRes.data));
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
  }, [flowId]);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Relatórios de respostas</h1>
        <p className="text-sm text-gray-300 mt-1">
          Agregação das capturas do node Capturar Entrada (escolha única ou múltipla)
        </p>
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

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-600 text-red-200 text-sm">
          {error}
        </div>
      )}

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-3">Contagem por opção</h2>
        {aggregates.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhuma resposta registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-700">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#1a2332] text-gray-300">
                <tr>
                  <th className="px-4 py-2">Pergunta</th>
                  <th className="px-4 py-2">Opção</th>
                  <th className="px-4 py-2">Respostas</th>
                </tr>
              </thead>
              <tbody className="text-gray-200 divide-y divide-gray-700">
                {aggregates.map((row, i) => (
                  <tr key={`${row.questionKey}-${row.optionId}-${i}`} className="bg-[#0f1419]">
                    <td className="px-4 py-2">{row.questionKey}</td>
                    <td className="px-4 py-2">
                      {row.optionLabel}{" "}
                      <span className="text-gray-500 text-xs">({row.optionId})</span>
                    </td>
                    <td className="px-4 py-2 font-semibold text-teal-400">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Últimas respostas</h2>
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
                  <span className="font-medium text-teal-300">{ev.questionKey}</span>
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
