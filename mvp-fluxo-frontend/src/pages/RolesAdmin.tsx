import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import InfoTooltip from "~components/InfoTooltip";
import type { AppPermission } from "~lib/permissions";
import { hasPermission } from "~lib/permissions";

type RoleRow = {
  id: string;
  name: string;
  label: string;
  is_system: boolean;
  permissions: AppPermission[];
  user_count: number;
};

type PermissionMeta = {
  key: AppPermission;
  label: string;
  group: string;
  description: string;
};

function groupPermissions(catalog: PermissionMeta[]) {
  const groups = new Map<string, PermissionMeta[]>();
  for (const item of catalog) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  return [...groups.entries()];
}

export default function RolesAdmin() {
  const canManage = hasPermission("roles");
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [catalog, setCatalog] = useState<PermissionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<AppPermission[]>([]);
  const [editLabel, setEditLabel] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    label: "",
    permissions: [] as AppPermission[],
  });

  const groupedCatalog = useMemo(() => groupPermissions(catalog), [catalog]);

  const load = async () => {
    setLoading(true);
    try {
      const [rolesRes, catalogRes] = await Promise.all([
        api.get("/roles"),
        api.get("/roles/permissions-catalog"),
      ]);
      setRoles(unwrapApiData<RoleRow[]>(rolesRes.data));
      setCatalog(unwrapApiData<PermissionMeta[]>(catalogRes.data));
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar perfis"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startEdit = (role: RoleRow) => {
    if (role.name === "platform_admin" || role.name === "agente") return;
    setEditingId(role.id);
    setEditPerms([...role.permissions]);
    setEditLabel(role.label);
  };

  const togglePerm = (
    list: AppPermission[],
    key: AppPermission,
    checked: boolean
  ): AppPermission[] => {
    if (checked) return list.includes(key) ? list : [...list, key];
    return list.filter((p) => p !== key);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/roles/${editingId}`, {
        label: editLabel,
        permissions: editPerms,
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao salvar perfil"));
    } finally {
      setSaving(false);
    }
  };

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/roles", createForm);
      setCreateForm({ name: "", label: "", permissions: [] });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao criar perfil"));
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (role: RoleRow) => {
    if (role.is_system) return;
    if (!window.confirm(`Excluir o perfil "${role.label}"?`)) return;
    setSaving(true);
    try {
      await api.delete(`/roles/${role.id}`);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao excluir perfil"));
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="p-8 text-gray-200">
        <h1 className="text-2xl font-bold text-white">Perfis e permissões</h1>
        <p className="mt-4">Você não tem permissão para gerenciar perfis.</p>
        <Link to="/dashboard" className="text-cyan-300 underline mt-2 inline-block">
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Perfis e permissões</h1>
        <p className="text-sm text-gray-300 mt-1 flex items-center gap-2">
          Defina o que cada perfil pode acessar no admin.
          <InfoTooltip text="Perfis do sistema podem ter permissões ajustadas. Perfis customizados podem ser criados para equipes específicas." />
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Usuários precisam fazer login novamente após alterar permissões do próprio perfil.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-500/20 border border-red-400/40 text-red-100 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-gray-300">Carregando perfis…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((role) => (
            <div
              key={role.id}
              className="bg-white rounded-xl p-4 border border-gray-100 shadow text-gray-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-gray-900">{role.label}</h2>
                  <p className="text-xs text-gray-500">
                    {role.is_system ? "Perfil do sistema" : "Perfil customizado"} ·{" "}
                    <code className="text-gray-600">{role.name}</code> · {role.user_count}{" "}
                    usuário(s)
                  </p>
                </div>
                <div className="flex gap-2">
                  {role.name !== "platform_admin" && role.name !== "agente" ? (
                    <button
                      type="button"
                      onClick={() => startEdit(role)}
                      className="text-sm text-cyan-700 hover:underline"
                    >
                      Editar
                    </button>
                  ) : null}
                  {!role.is_system ? (
                    <button
                      type="button"
                      onClick={() => void removeRole(role)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {role.permissions.length === 0 ? (
                  <span className="text-xs text-gray-500">Sem acesso admin</span>
                ) : (
                  role.permissions.map((p) => (
                    <span
                      key={p}
                      className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full"
                    >
                      {catalog.find((c) => c.key === p)?.label ?? p}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editingId ? (
        <div className="bg-white rounded-xl p-5 border border-cyan-200 shadow-lg text-gray-900">
          <h3 className="font-semibold text-gray-900 mb-3">Editar permissões</h3>
          <label className="block text-sm text-gray-700 mb-3">
            Nome de exibição
            <input
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
            />
          </label>
          <div className="space-y-4 max-h-80 overflow-y-auto">
            {groupedCatalog.map(([group, items]) => (
              <div key={group}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {group}
                </p>
                <div className="mt-2 grid sm:grid-cols-2 gap-2">
                  {items.map((item) => (
                    <label
                      key={item.key}
                      className="flex items-start gap-2 text-sm text-gray-800"
                    >
                      <input
                        type="checkbox"
                        checked={editPerms.includes(item.key)}
                        onChange={(e) =>
                          setEditPerms((prev) =>
                            togglePerm(prev, item.key, e.target.checked)
                          )
                        }
                      />
                      <span>
                        {item.label}
                        <span className="block text-xs text-gray-500">{item.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={saving || editPerms.length === 0}
              onClick={() => void saveEdit()}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 bg-white"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={(e) => void createRole(e)}
        className="bg-white rounded-xl p-5 border border-gray-100 shadow text-gray-900"
      >
        <h3 className="font-semibold text-gray-900 mb-3">Criar perfil customizado</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-gray-700">
            Identificador (slug)
            <input
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white placeholder:text-gray-400"
              placeholder="supervisao_pesquisas"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label className="text-sm text-gray-700">
            Nome de exibição
            <input
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white placeholder:text-gray-400"
              placeholder="Supervisão Pesquisas"
              value={createForm.label}
              onChange={(e) => setCreateForm((f) => ({ ...f, label: e.target.value }))}
              required
            />
          </label>
        </div>
        <div className="mt-4 space-y-4 max-h-64 overflow-y-auto">
          {groupedCatalog.map(([group, items]) => (
            <div key={group}>
              <p className="text-xs font-semibold text-gray-500 uppercase">{group}</p>
              <div className="mt-2 grid sm:grid-cols-2 gap-2">
                {items.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={createForm.permissions.includes(item.key)}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          permissions: togglePerm(f.permissions, item.key, e.target.checked),
                        }))
                      }
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          type="submit"
          disabled={saving || createForm.permissions.length === 0}
          className="mt-4 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium disabled:opacity-50"
        >
          Criar perfil
        </button>
      </form>
    </div>
  );
}
