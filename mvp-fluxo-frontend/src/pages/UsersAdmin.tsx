import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import InfoTooltip from "~components/InfoTooltip";
import { hasPermission } from "~lib/permissions";
import {
  getPasswordPolicyError,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
} from "~lib/password-policy";
import {
  adminBtnDangerClass,
  adminBtnLinkClass,
  adminBtnPrimaryClass,
  adminBtnSecondaryClass,
  adminErrorClass,
  adminInputInlineClass,
  adminModalClass,
  adminModalOverlayClass,
  adminPageShellClass,
  adminPanelClass,
  adminSectionClass,
  adminSelectClass,
  adminTableHeadClass,
  adminTableRowClass,
} from "~lib/admin-ui";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role_id: string;
  role_name: string;
};

type AssignableRole = {
  id: string;
  name: string;
  label: string;
  is_system: boolean;
};

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
  const [assignableRoles, setAssignableRoles] = useState<AssignableRole[]>([]);
  const simulationFeatureKey = getSimulationFeatureKey();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role_id: "",
  });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    password: "",
    role_id: "",
  });
  const [simulationEnabled, setSimulationEnabled] = useState(
    () => localStorage.getItem(getSimulationFeatureKey()) === "true"
  );
  const [simulationNotice, setSimulationNotice] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);

  const loadAssignableRoles = async () => {
    try {
      const res = await api.get("/roles/assignable");
      const roles = unwrapApiData<AssignableRole[]>(res.data);
      setAssignableRoles(roles);
      const agentRole = roles.find((r) => r.name === "agente");
      if (agentRole) {
        setForm((f) => (f.role_id ? f : { ...f, role_id: agentRole.id }));
      }
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar perfis"));
    }
  };

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
    void loadAssignableRoles();
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
    const passwordError = getPasswordPolicyError(form.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/users", form);
      const agentRole = assignableRoles.find((r) => r.name === "agente");
      setForm({
        name: "",
        email: "",
        password: "",
        role_id: agentRole?.id ?? "",
      });
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
      role_id: user.role_id,
    });
  };

  const saveEdit = async () => {
    if (!editingUserId) return;
    if (editForm.password.trim()) {
      const passwordError = getPasswordPolicyError(editForm.password);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      await api.put(`/users/${editingUserId}`, {
        name: editForm.name,
        email: editForm.email,
        password: editForm.password || undefined,
        role_id: editForm.role_id,
      });
      setEditingUserId(null);
      setEditForm({ name: "", email: "", password: "", role_id: "" });
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

  const checkboxClass = "rounded border-zinc-600 bg-zinc-900 accent-cyan-500";

  return (
    <div className={adminPageShellClass()}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuários e Permissões</h1>
          <p className="text-sm text-gray-300 mt-1 flex items-center gap-2">
            Crie usuários e associe a um perfil com permissões definidas.
            <InfoTooltip text="Controle aqui quem pode administrar canais, fluxos e atendimento dentro do tenant." />
          </p>
          {hasPermission("roles") ? (
            <p className="text-xs text-cyan-300 mt-2">
              <Link to="/admin/roles" className="underline hover:text-cyan-200">
                Gerenciar perfis e permissões
              </Link>
            </p>
          ) : null}
          <p className="text-xs text-gray-400 mt-1">
            O campo de nome define como o atendente aparece nas mensagens para o cliente.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenTour}
          className="w-8 h-8 rounded-full border border-cyan-400/60 text-cyan-200 hover:bg-cyan-500/10 text-sm shrink-0"
          title="Reabrir tour de usuários"
          aria-label="Reabrir tour de usuários"
        >
          ?
        </button>
      </header>

      <section className={`${adminSectionClass} text-sm`}>
        <p className="font-semibold text-white flex items-center gap-2">
          Ambiente de testes
          <InfoTooltip text="Essa opção só afeta a interface local deste tenant e facilita validações sem envio real." />
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Habilita o botão oculto "Simular cliente" na tela de atendimento para validar layout sem envio real.
        </p>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={simulationEnabled}
            onChange={(e) => toggleSimulationFeature(e.target.checked)}
          />
          Ativar simulação local para este tenant
        </label>
        {simulationNotice ? <p className="mt-2 text-xs text-emerald-300">{simulationNotice}</p> : null}
      </section>

      {error ? <div className={adminErrorClass}>{error}</div> : null}

      <form onSubmit={onSubmit} className={adminSectionClass}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className={adminInputInlineClass}
            placeholder="Nome de exibicao no atendimento"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <input
            className={adminInputInlineClass}
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            required
          />
          <input
            className={adminInputInlineClass}
            placeholder="Senha"
            type="password"
            minLength={PASSWORD_MIN_LENGTH}
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            required
          />
          <div className="flex gap-2 min-w-0">
            <select
              className={`${adminSelectClass} mt-0 flex-1 min-w-0`}
              value={form.role_id}
              onChange={(e) => setForm((p) => ({ ...p, role_id: e.target.value }))}
            >
              {assignableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving}
              className={`${adminBtnPrimaryClass} shrink-0`}
              title="Cria o usuário com o papel selecionado."
            >
              {saving ? "Salvando..." : "Criar"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">{PASSWORD_POLICY_MESSAGE}</p>
      </form>

      <div className={adminPanelClass}>
        <table className="w-full text-sm">
          <thead className={adminTableHeadClass}>
            <tr>
              <th className="px-4 py-3 text-left">Nome de exibicao</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Perfil</th>
            </tr>
          </thead>
          <tbody className="text-gray-200">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Carregando...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className={adminTableRowClass}>
                  <td className="px-4 py-3 text-white">
                    {editingUserId === user.id ? (
                      <input
                        className={adminInputInlineClass}
                        value={editForm.name}
                        onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      />
                    ) : (
                      user.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {editingUserId === user.id ? (
                      <input
                        className={adminInputInlineClass}
                        value={editForm.email}
                        onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                      />
                    ) : (
                      user.email
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingUserId === user.id ? (
                      <div className="flex flex-wrap gap-2">
                        <select
                          className={adminInputInlineClass}
                          value={editForm.role_id}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, role_id: e.target.value }))
                          }
                        >
                          {assignableRoles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className={adminInputInlineClass}
                          placeholder="Nova senha (opcional)"
                          type="password"
                          minLength={PASSWORD_MIN_LENGTH}
                          value={editForm.password}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, password: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className={adminBtnPrimaryClass}
                          disabled={saving}
                          onClick={saveEdit}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className={adminBtnSecondaryClass}
                          onClick={() => setEditingUserId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-gray-300">
                          {assignableRoles.find((r) => r.id === user.role_id)?.label ??
                            user.role_name}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={adminBtnLinkClass}
                            onClick={() => startEdit(user)}
                            title="Editar nome, email, perfil e senha opcional."
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className={adminBtnDangerClass}
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
        <div className={adminModalOverlayClass}>
          <div className={adminModalClass}>
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
                    className={adminBtnPrimaryClass}
                  >
                    Próximo
                  </button>
                ) : (
                  <button type="button" onClick={handleCloseTour} className={adminBtnPrimaryClass}>
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
