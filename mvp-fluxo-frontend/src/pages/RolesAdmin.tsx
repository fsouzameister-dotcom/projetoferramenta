import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import InfoTooltip from "~components/InfoTooltip";
import type { AppPermission } from "~lib/permissions";
import { hasPermission } from "~lib/permissions";
import {
  adminBtnDangerClass,
  adminBtnLinkClass,
  adminBtnPrimaryClass,
  adminBtnSecondaryClass,
  adminCodeClass,
  adminErrorClass,
  adminInputClass,
  adminLabelClass,
  adminLegendClass,
  adminPageShellClass,
  adminSectionClass,
} from "~lib/admin-ui";

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
      <div className={adminPageShellClass()}>
        <h1 className="text-2xl font-bold text-white">Perfis e permissões</h1>
        <p className="mt-4 text-gray-300">Você não tem permissão para gerenciar perfis.</p>
        <Link to="/dashboard" className="text-cyan-300 underline mt-2 inline-block hover:text-cyan-200">
          Voltar ao painel
        </Link>
      </div>
    );
  }

  const checkboxClass = "rounded border-zinc-600 bg-zinc-900 accent-cyan-500 mt-1";

  return (
    <div className={adminPageShellClass(true)}>
      <header>
        <h1 className="text-2xl font-bold text-white">Perfis e permissões</h1>
        <p className="text-sm text-gray-300 mt-1 flex items-center gap-2">
          Defina o que cada perfil pode acessar no admin.
          <InfoTooltip text="Perfis do sistema podem ter permissões ajustadas. Perfis customizados podem ser criados para equipes específicas." />
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Usuários precisam fazer login novamente após alterar permissões do próprio perfil.
        </p>
      </header>

      {error ? <div className={adminErrorClass}>{error}</div> : null}

      {loading ? (
        <p className="text-gray-400">Carregando perfis…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((role) => (
            <div key={role.id} className={adminSectionClass}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-white">{role.label}</h2>
                  <p className="text-xs text-gray-400">
                    {role.is_system ? "Perfil do sistema" : "Perfil customizado"} ·{" "}
                    <code className={adminCodeClass}>{role.name}</code> · {role.user_count}{" "}
                    usuário(s)
                  </p>
                </div>
                <div className="flex gap-2">
                  {role.name !== "platform_admin" && role.name !== "agente" ? (
                    <button type="button" onClick={() => startEdit(role)} className={adminBtnLinkClass}>
                      Editar
                    </button>
                  ) : null}
                  {!role.is_system ? (
                    <button
                      type="button"
                      onClick={() => void removeRole(role)}
                      className={adminBtnDangerClass}
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
                      className="text-xs bg-zinc-900/80 border border-zinc-600/60 text-gray-300 px-2 py-0.5 rounded-full"
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
        <div className={`${adminSectionClass} border-cyan-500/40`}>
          <h3 className="font-semibold text-white mb-3">Editar permissões</h3>
          <label className={adminLabelClass}>
            Nome de exibição
            <input
              className={adminInputClass}
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
            />
          </label>
          <div className="mt-4 space-y-4 max-h-80 overflow-y-auto">
            {groupedCatalog.map(([group, items]) => (
              <div key={group}>
                <p className={adminLegendClass}>{group}</p>
                <div className="mt-2 grid sm:grid-cols-2 gap-2">
                  {items.map((item) => (
                    <label key={item.key} className="flex items-start gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        className={checkboxClass}
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
              className={adminBtnPrimaryClass}
            >
              Salvar
            </button>
            <button type="button" onClick={() => setEditingId(null)} className={adminBtnSecondaryClass}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={(e) => void createRole(e)} className={`${adminSectionClass} space-y-4`}>
        <h3 className="font-semibold text-white">Criar perfil customizado</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className={adminLabelClass}>
            Identificador (slug)
            <input
              className={adminInputClass}
              placeholder="supervisao_pesquisas"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </label>
          <label className={adminLabelClass}>
            Nome de exibição
            <input
              className={adminInputClass}
              placeholder="Supervisão Pesquisas"
              value={createForm.label}
              onChange={(e) => setCreateForm((f) => ({ ...f, label: e.target.value }))}
              required
            />
          </label>
        </div>
        <div className="space-y-4 max-h-64 overflow-y-auto">
          {groupedCatalog.map(([group, items]) => (
            <div key={group}>
              <p className={adminLegendClass}>{group}</p>
              <div className="mt-2 grid sm:grid-cols-2 gap-2">
                {items.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      className={checkboxClass}
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
          className={adminBtnPrimaryClass}
        >
          Criar perfil
        </button>
      </form>
    </div>
  );
}
