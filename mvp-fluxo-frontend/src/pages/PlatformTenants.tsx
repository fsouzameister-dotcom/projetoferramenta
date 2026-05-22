import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getApiErrorMessage, unwrapApiData } from "~api/client";
import TenantActingBanner from "~components/TenantActingBanner";
import {
  getHomeTenantId,
  isPlatformAdmin,
  setActingTenant,
} from "~lib/session";

type CustomerTenant = {
  id: string;
  name: string;
  slug: string;
  segment?: string | null;
  plan?: string;
  is_active?: boolean;
};

const SEGMENTS = [
  { value: "", label: "—" },
  { value: "pesquisa", label: "Pesquisa" },
  { value: "atendimento", label: "Atendimento" },
  { value: "captacao", label: "Captação" },
  { value: "vendas", label: "Vendas" },
  { value: "misto", label: "Misto" },
] as const;

export default function PlatformTenants() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<CustomerTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    segment: "",
    initial_admin_name: "",
    initial_admin_email: "",
    initial_admin_password: "",
  });

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/platform/tenants", {
        headers: { "x-tenant-id": getHomeTenantId() },
      });
      setTenants(unwrapApiData<CustomerTenant[]>(res.data));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Erro ao carregar clientes"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPlatformAdmin()) {
      navigate("/dashboard", { replace: true });
      return;
    }
    void loadTenants();
  }, [loadTenants, navigate]);

  const openTenant = (t: CustomerTenant) => {
    setActingTenant(t.id, t.name);
    navigate("/dashboard");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.post(
        "/platform/tenants",
        {
          name: form.name.trim(),
          slug: form.slug.trim(),
          segment: form.segment || undefined,
          initial_admin_name: form.initial_admin_name.trim(),
          initial_admin_email: form.initial_admin_email.trim(),
          initial_admin_password: form.initial_admin_password,
        },
        { headers: { "x-tenant-id": getHomeTenantId() } }
      );
      setForm({
        name: "",
        slug: "",
        segment: "",
        initial_admin_name: "",
        initial_admin_email: "",
        initial_admin_password: "",
      });
      await loadTenants();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Erro ao criar tenant"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <TenantActingBanner />
      <header>
        <h1 className="text-2xl font-bold text-white">Clientes (tenants)</h1>
        <p className="text-sm text-gray-300 mt-1">
          Gerencie ambientes de clientes e abra o tenant para configurar fluxos, WhatsApp e
          agentes com acesso master.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-zinc-600/60 bg-zinc-800/40 p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Novo cliente</h2>
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-gray-300">Nome</span>
            <input
              required
              className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-white"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-300">Slug (URL interna)</span>
            <input
              required
              className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-white"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="pesquisas-xyz"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-300">Segmento</span>
            <select
              className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-white"
              value={form.segment}
              onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}
            >
              {SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-300">Admin inicial — nome</span>
            <input
              required
              className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-white"
              value={form.initial_admin_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, initial_admin_name: e.target.value }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-300">Admin inicial — e-mail (único na plataforma)</span>
            <input
              required
              type="email"
              className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-white"
              value={form.initial_admin_email}
              onChange={(e) =>
                setForm((f) => ({ ...f, initial_admin_email: e.target.value }))
              }
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-gray-300">Senha inicial do admin do cliente</span>
            <input
              required
              type="password"
              minLength={6}
              className="mt-1 w-full max-w-md rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-white"
              value={form.initial_admin_password}
              onChange={(e) =>
                setForm((f) => ({ ...f, initial_admin_password: e.target.value }))
              }
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {creating ? "Criando…" : "Criar tenant"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-600/60 bg-zinc-800/40 p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Tenants cadastrados</h2>
        {loading ? (
          <p className="text-gray-400 text-sm">Carregando…</p>
        ) : tenants.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhum tenant de cliente ainda.</p>
        ) : (
          <ul className="divide-y divide-zinc-700/80">
            {tenants.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"
              >
                <div>
                  <p className="font-medium text-white">{t.name}</p>
                  <p className="text-xs text-gray-400">
                    {t.slug}
                    {t.segment ? ` · ${t.segment}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openTenant(t)}
                  className="rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600"
                >
                  Abrir ambiente
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
