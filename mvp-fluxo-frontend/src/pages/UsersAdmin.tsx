import { useEffect, useMemo, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import {
  getActingTenantId,
  getHomeTenantId,
  isPlatformAdmin,
} from "~lib/session";
import InfoTooltip from "~components/InfoTooltip";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role_name: string;
};

const customerRoleOptions = [
  { value: "admin_local", label: "Admin local" },
  { value: "supervisor", label: "Supervisor" },
  { value: "agente", label: "Agente" },
];

const USERS_ADMIN_TOUR_STORAGE_KEY = "users_admin_tour_completed_v1";
const USERS_ADMIN_TOUR_STEPS = [
  {
    title: "Perfis e permissões",
    description:
      "Aqui você controla quem acessa o tenant e com qual papel: admin local, supervisor ou agente.",
  },
  {
    title: "Criar usuário",
    description:
      "Cadastre nome, e-mail, senha e perfil. O nome será exibido para o cliente no atendimento.",
  },
  {
    title: "Manutenção da equipe",
    description:
      "Use editar e excluir na tabela para manter perfis atualizados conforme operação e escala.",
  },
] as const;

function getSimulationFeatureKey(): string {
  const tenantId = localStorage.getItem("tenant_id") || "default";
  return `agent_test_simulation_enabled_${tenantId}`;
}

export default function UsersAdmin() {
  const roleOptions = useMemo(() => {
    const onPlatformHome =
      isPlatformAdmin() && getActingTenantId() === getHomeTenantId();
    if (onPlatformHome) {
      return [
        { value: "platform_admin", label: "Operador plataforma (master)" },
        ...customerRoleOptions,
      ];
    }
    return customerRoleOptions;
  }, []);

  const simulationFeatureKey = getSimulationFeatureKey();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role_name: "agente",
  });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    password: "",
    role_name: "agente",
  });
  const [simulationEnabled, setSimulationEnabled] = useState(
    () => localStorage.getItem(getSimulationFeatureKey()) === "true"
  );
  const [simulationNotice, setSimulationNotice] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get("/users");
      setUsers(unwrapApiData<UserRow[]>(res.data));
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar usuários"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    const completed = localStorage.getItem(USERS_ADMIN_TOUR_STORAGE_KEY) === "true";
    if (!completed) {
      setTourStepIndex(0);
      setShowTour(true);
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/users", form);
      setForm({ name: "", email: "", password: "", role_name: "agente" });
      await loadUsers();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao criar usuário"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (user: UserRow) => {
    setEditingUserId(user.id);
    setEditForm({
      name: user.name,
      email: user.email,
      password: "",
      role_name: user.role_name,
    });
  };

  const saveEdit = async () => {
    if (!editingUserId) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/users/${editingUserId}`, {
        name: editForm.name,
        email: editForm.email,
        password: editForm.password || undefined,
        role_name: editForm.role_name,
      });
      setEditingUserId(null);
      setEditForm({ name: "", email: "", password: "", role_name: "agente" });
      await loadUsers();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao atualizar usuário"));
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (user: UserRow) => {
    if (!window.confirm(`Excluir usuário ${user.email}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/users/${user.id}`);
      await loadUsers();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao excluir usuário"));
    } finally {
      setSaving(false);
    }
  };

  const toggleSimulationFeature = (checked: boolean) => {
    localStorage.setItem(simulationFeatureKey, checked ? "true" : "false");
    setSimulationEnabled(checked);
    setSimulationNotice(
      checked
        ? "Simulação de mensagem do cliente habilitada para este ambiente."
        : "Simulação de mensagem do cliente desabilitada para este ambiente."
    );
  };

  const handleCloseTour = () => {
    setShowTour(false);
    localStorage.setItem(USERS_ADMIN_TOUR_STORAGE_KEY, "true");
  };

  const handleOpenTour = () => {
    setTourStepIndex(0);
    setShowTour(true);
  };

  return (
    <div className="p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuários e Permissões</h1>
          <p className="text-sm text-gray-300 mt-1 flex items-center gap-2">
            Crie perfis de admin local, supervisor e agente.
            <InfoTooltip text="Controle aqui quem pode administrar canais, fluxos e atendimento dentro do tenant." />
          </p>
          <p className="text-xs text-gray-400 mt-1">
            O campo de nome define como o atendente aparece nas mensagens para o cliente.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenTour}
          className="w-8 h-8 rounded-full border border-cyan-400/60 text-cyan-200 hover:bg-cyan-500/10 text-sm"
          title="Reabrir tour de usuários"
          aria-label="Reabrir tour de usuários"
        >
          ?
        </button>
      </div>
      <div className="mt-4 bg-white rounded-xl p-4 border border-gray-100">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          Ambiente de testes
          <InfoTooltip text="Essa opção só afeta a interface local deste tenant e facilita validações sem envio real." />
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Habilita o botão oculto "Simular cliente" na tela de atendimento para validar layout sem envio real.
        </p>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-800">
          <input
            type="checkbox"
            checked={simulationEnabled}
            onChange={(e) => toggleSimulationFeature(e.target.checked)}
          />
          Ativar simulação local para este tenant
        </label>
        {simulationNotice ? <p className="mt-2 text-xs text-teal-700">{simulationNotice}</p> : null}
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 bg-white rounded-xl p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          className="border rounded-lg px-3 py-2 text-gray-900"
          placeholder="Nome de exibicao no atendimento"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
        />
        <input
          className="border rounded-lg px-3 py-2 text-gray-900"
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          required
        />
        <input
          className="border rounded-lg px-3 py-2 text-gray-900"
          placeholder="Senha"
          type="password"
          value={form.password}
          onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
          required
        />
        <div className="flex gap-2">
          <select
            className="border rounded-lg px-3 py-2 text-gray-900 flex-1"
            value={form.role_name}
            onChange={(e) => setForm((p) => ({ ...p, role_name: e.target.value }))}
          >
            {roleOptions.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-white px-4 rounded-lg hover:bg-accent-dark disabled:opacity-50"
            title="Cria o usuário com o papel selecionado."
          >
            {saving ? "Salvando..." : "Criar"}
          </button>
        </div>
      </form>

      <div className="mt-6 bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left">Nome de exibicao</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Perfil</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  Carregando...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="px-4 py-3 text-gray-800">
                    {editingUserId === user.id ? (
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={editForm.name}
                        onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      />
                    ) : (
                      user.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {editingUserId === user.id ? (
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={editForm.email}
                        onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                      />
                    ) : (
                      user.email
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {editingUserId === user.id ? (
                      <div className="flex gap-2">
                        <select
                          className="border rounded px-2 py-1"
                          value={editForm.role_name}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, role_name: e.target.value }))
                          }
                        >
                          {roleOptions.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className="border rounded px-2 py-1"
                          placeholder="Nova senha (opcional)"
                          type="password"
                          value={editForm.password}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, password: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="px-3 py-1 bg-teal-600 text-white rounded"
                          disabled={saving}
                          onClick={saveEdit}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1 border rounded"
                          onClick={() => setEditingUserId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <span>{user.role_name}</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-blue-600 hover:underline"
                            onClick={() => startEdit(user)}
                            title="Editar nome, email, perfil e senha opcional."
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="text-red-600 hover:underline"
                            onClick={() => removeUser(user)}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {showTour ? (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111827] border border-[#334155] rounded-xl p-5">
            <p className="text-[11px] uppercase tracking-wide text-cyan-300 mb-1">
              Tour de usuários
            </p>
            <h3 className="text-lg font-semibold text-white">
              {USERS_ADMIN_TOUR_STEPS[tourStepIndex]?.title}
            </h3>
            <p className="text-sm text-gray-200 mt-2 leading-relaxed">
              {USERS_ADMIN_TOUR_STEPS[tourStepIndex]?.description}
            </p>
            <p className="text-[11px] text-gray-400 mt-4">
              Passo {tourStepIndex + 1} de {USERS_ADMIN_TOUR_STEPS.length}
            </p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleCloseTour}
                className="px-3 py-1.5 rounded-lg border border-[#475569] text-gray-200 hover:bg-[#1e293b] text-sm"
              >
                Fechar
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTourStepIndex((prev) => Math.max(0, prev - 1))}
                  disabled={tourStepIndex === 0}
                  className="px-3 py-1.5 rounded-lg border border-[#475569] text-gray-200 hover:bg-[#1e293b] text-sm disabled:opacity-50"
                >
                  Voltar
                </button>
                {tourStepIndex < USERS_ADMIN_TOUR_STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setTourStepIndex((prev) =>
                        Math.min(USERS_ADMIN_TOUR_STEPS.length - 1, prev + 1)
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 text-sm"
                  >
                    Próximo
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCloseTour}
                    className="px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 text-sm"
                  >
                    Concluir
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
