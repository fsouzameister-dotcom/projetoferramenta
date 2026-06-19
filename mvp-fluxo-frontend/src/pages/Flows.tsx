import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import {
  adminBtnLinkClass,
  adminBtnPrimaryClass,
  adminBtnSecondaryClass,
  adminErrorClass,
  adminPageShellClass,
  adminPanelClass,
  adminTableHeadClass,
  adminTableRowClass,
} from "~lib/admin-ui";

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
  const [savingId, setSavingId] = useState<string | null>(null);
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

  const toggleActive = async (flow: Flow) => {
    setSavingId(flow.id);
    setError(null);
    try {
      await api.patch(`/flows/${flow.id}`, { is_active: !flow.is_active });
      setFlows((prev) =>
        prev.map((f) => (f.id === flow.id ? { ...f, is_active: !f.is_active } : f))
      );
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao atualizar status do fluxo"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className={adminPageShellClass()}>
      <header>
        <h1 className="text-2xl font-bold text-white">Fluxos</h1>
        <p className="text-sm text-gray-300 mt-1">
          Gerencie os fluxos de atendimento do tenant atual
        </p>
      </header>

      {error ? <div className={adminErrorClass}>{error}</div> : null}

      <div className={adminPanelClass}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700/80">
          <h2 className="text-lg font-semibold text-white">Lista de fluxos</h2>
          <Link to="/flows/new" className={adminBtnPrimaryClass}>
            + Novo Fluxo
          </Link>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">Carregando fluxos...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className={adminTableHeadClass}>
              <tr>
                <th className="px-6 py-3 font-medium">Nome</th>
                <th className="px-6 py-3 font-medium">Canal</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Ativo</th>
                <th className="px-6 py-3 font-medium">Criado em</th>
                <th className="px-6 py-3 font-medium">Acao</th>
              </tr>
            </thead>
            <tbody className="text-gray-200">
              {flows.length > 0 ? (
                flows.map((flow) => (
                  <tr key={flow.id} className={`${adminTableRowClass} hover:bg-zinc-700/20 transition-colors`}>
                    <td className="px-6 py-4 font-medium text-white">{flow.name}</td>
                    <td className="px-6 py-4 capitalize text-gray-300">{flow.channel || "-"}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          flow.is_active
                            ? "bg-emerald-500/20 text-emerald-200"
                            : "bg-zinc-600/50 text-gray-400"
                        }`}
                      >
                        {flow.is_active ? "Publicado" : "Rascunho"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        disabled={savingId === flow.id}
                        onClick={() => void toggleActive(flow)}
                        className={`${adminBtnSecondaryClass} text-xs disabled:opacity-50 ${
                          !flow.is_active ? "border-cyan-500/40 text-cyan-200" : ""
                        }`}
                      >
                        {savingId === flow.id
                          ? "Salvando..."
                          : flow.is_active
                            ? "Desativar"
                            : "Ativar"}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-gray-400">
                      {flow.created_at
                        ? new Date(flow.created_at).toLocaleDateString("pt-BR")
                        : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <Link to={`/flows/${flow.id}`} className={adminBtnLinkClass}>
                        Editar →
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
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
