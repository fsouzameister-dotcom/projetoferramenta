import { useEffect, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role_name: string;
};

const roleOptions = [
  { value: "admin_local", label: "Admin local" },
  { value: "supervisor", label: "Supervisor" },
  { value: "agente", label: "Agente" },
];

export default function UsersAdmin() {
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

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white">Usuários e Permissões</h1>
      <p className="text-sm text-gray-300 mt-1">
        Crie perfis de admin local, supervisor e agente.
      </p>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 bg-white rounded-xl p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          className="border rounded-lg px-3 py-2 text-gray-900"
          placeholder="Nome"
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
          >
            {saving ? "Salvando..." : "Criar"}
          </button>
        </div>
      </form>

      <div className="mt-6 bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Perfil</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                  Carregando...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
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
    </div>
  );
}
