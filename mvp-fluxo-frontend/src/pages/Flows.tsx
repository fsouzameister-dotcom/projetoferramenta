import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

interface Flow {
  id: string;
  name: string;
  channel: string;
  is_active: boolean;
  created_at: string;
}

export default function Flows() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    api
      .get("/flows")
      .then((res) => {
        setFlows(unwrapApiData<Flow[]>(res.data));
      })
      .catch((err) => {
        setError(getApiErrorMessage(err, "Nao foi possivel carregar os fluxos. Verifique backend e autenticacao."));
        setFlows([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Fluxos</h1>
        <p className="text-sm text-gray-300 mt-1">
          Gerencie os fluxos de atendimento do tenant atual
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-600 rounded-xl px-6 py-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-primary">Lista de fluxos</h2>
          <Link
            to="/flows/new"
            className="bg-accent text-white text-sm px-4 py-2 rounded-lg hover:bg-accent-dark transition-colors"
          >
            + Novo Fluxo
          </Link>
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
                <th className="px-6 py-3 font-medium">Acao</th>
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
                      {flow.channel || "-"}
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
                        : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        to={`/flows/${flow.id}`}
                        className="text-accent hover:text-accent-dark font-medium transition-colors"
                      >
                        Editar →
                      </Link>
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
                      : "Nenhum fluxo encontrado. Crie o primeiro."}
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
