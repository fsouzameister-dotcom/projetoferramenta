import { useEffect, useState } from "react";
import api from "../api/client";

const tenantId = "1be433d5-f15b-4764-9a85-e88f3bc88732";

interface Flow {
  id: string;
  name: string;
  channel: string;
  is_active: boolean;
  created_at: string;
}

export default function Dashboard() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    api
      .get(`/tenants/${tenantId}/flows`)
      .then((res) => {
        console.log("=== RESPOSTA /flows ===", res.data);

        const data = res.data;
        let list: Flow[] = [];

        if (Array.isArray(data)) {
          list = data;
        } else if (data && Array.isArray(data.data)) {
          list = data.data;
        } else if (data && Array.isArray(data.flows)) {
          list = data.flows;
        }

        console.log("Lista normalizada de flows:", list);
        setFlows(list);
        setError(null);
      })
      .catch((err) => {
        console.error("Erro ao carregar flows:", err);
        setError(
          "Não foi possível carregar os fluxos. Verifique se o backend está rodando."
        );
        setFlows([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalFlows = flows.length;
  const activeFlows = flows.filter((f) => f.is_active).length;
  const inactiveFlows = totalFlows - activeFlows;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Visão geral dos seus fluxos de atendimento
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Total de Flows</p>
          <p className="text-2xl font-bold text-primary mt-1">
            {loading ? "—" : totalFlows}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Flows Ativos</p>
          <p className="text-2xl font-bold text-green-500 mt-1">
            {loading ? "—" : activeFlows}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Flows Inativos</p>
          <p className="text-2xl font-bold text-gray-400 mt-1">
            {loading ? "—" : inactiveFlows}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-sm text-gray-500">Status API</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              error ? "text-red-500" : "text-green-500"
            }`}
          >
            {loading ? "—" : error ? "Offline" : "Online"}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-600 rounded-xl px-6 py-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-primary">Fluxos</h2>
          <a
            href="/flows/novo/editor"
            className="bg-accent text-white text-sm px-4 py-2 rounded-lg hover:bg-accent-dark transition-colors"
          >
            + Novo Fluxo
          </a>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">
            Carregando fluxos...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="px-6 py-3 font-medium">Nome</th>
                <th className="px-6 py-3 font-medium">Canal</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Criado em</th>
                <th className="px-6 py-3 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {flows.length > 0 ? (
                flows.map((flow) => (
                  <tr
                    key={flow.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-primary">
                      {flow.name}
                    </td>
                    <td className="px-6 py-4 capitalize text-gray-600">
                      {flow.channel || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          flow.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {flow.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400">
                      {flow.created_at
                        ? new Date(flow.created_at).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={`/flows/${flow.id}/canvas`}
                        className="text-accent hover:text-accent-dark font-medium transition-colors"
                      >
                        Editar →
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-gray-400"
                  >
                    {error
                      ? "Erro ao carregar fluxos."
                      : "Nenhum fluxo encontrado. Crie o primeiro!"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}