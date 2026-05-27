import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getApiErrorMessage, unwrapApiData } from "~api/client";
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

const PLATFORM_TENANTS_TOUR_STORAGE_KEY = "platform_tenants_tour_completed_v1";
const PLATFORM_TENANTS_TOUR_STEPS = [
  {
    title: "Gestão de clientes",
    description:
      "Esta tela centraliza tenants da plataforma para ativação inicial e operação em ambiente separado.",
  },
  {
    title: "Novo cliente",
    description:
      "Preencha os dados do tenant e do primeiro administrador para liberar o onboarding do cliente.",
  },
  {
    title: "Abrir ambiente",
    description:
      "Use Abrir ambiente para atuar no tenant selecionado e configurar fluxos, canais e usuários locais.",
  },
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
  const [showTour, setShowTour] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);

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

  useEffect(() => {
    const completed = localStorage.getItem(PLATFORM_TENANTS_TOUR_STORAGE_KEY) === "true";
    if (!completed) {
      setTourStepIndex(0);
      setShowTour(true);
    }
  }, []);

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

  const handleCloseTour = () => {
    setShowTour(false);
    localStorage.setItem(PLATFORM_TENANTS_TOUR_STORAGE_KEY, "true");
  };

  const handleOpenTour = () => {
    setTourStepIndex(0);
    setShowTour(true);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Clientes (tenants)</h1>
            <p className="text-sm text-gray-300 mt-1">
              Gerencie ambientes de clientes e abra o tenant para configurar fluxos, WhatsApp e
              agentes com acesso master.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenTour}
            className="w-8 h-8 rounded-full border border-cyan-400/60 text-cyan-200 hover:bg-cyan-500/10 text-sm"
            title="Reabrir tour de admin"
            aria-label="Reabrir tour de admin"
          >
            ?
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-zinc-600/60 bg-zinc-800/40 p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Novo cliente</h2>
        <p className="text-sm text-gray-400 mb-6">
          Cria o tenant e o primeiro administrador do ambiente do cliente.
        </p>
        <form onSubmit={handleCreate} className="space-y-8">
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-cyan-200/90 uppercase tracking-wide">
              Dados do cliente
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-1">
                <span className="text-gray-300">Nome</span>
                <input
                  required
                  className="mt-1.5 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-white"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="block text-sm sm:col-span-1">
                <span className="text-gray-300">Slug (URL interna)</span>
                <input
                  required
                  className="mt-1.5 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-white"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="pesquisas-xyz"
                />
              </label>
              <label className="block text-sm sm:col-span-2 sm:max-w-xs">
                <span className="text-gray-300">Segmento</span>
                <select
                  className="mt-1.5 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-white"
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
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-t border-zinc-700/80 pt-6">
            <legend className="text-sm font-semibold text-cyan-200/90 uppercase tracking-wide">
              Administrador inicial
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-gray-300">Nome</span>
                <input
                  required
                  className="mt-1.5 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-white"
                  value={form.initial_admin_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, initial_admin_name: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-300">E-mail (único na plataforma)</span>
                <input
                  required
                  type="email"
                  className="mt-1.5 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-white"
                  value={form.initial_admin_email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, initial_admin_email: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm sm:col-span-2 sm:max-w-md">
                <span className="text-gray-300">Senha inicial</span>
                <input
                  required
                  type="password"
                  minLength={6}
                  className="mt-1.5 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-white"
                  value={form.initial_admin_password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, initial_admin_password: e.target.value }))
                  }
                />
              </label>
            </div>
          </fieldset>

          <div className="pt-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark transition-colors disabled:opacity-50"
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
      {showTour ? (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111827] border border-[#334155] rounded-xl p-5">
            <p className="text-[11px] uppercase tracking-wide text-cyan-300 mb-1">
              Tour do admin
            </p>
            <h3 className="text-lg font-semibold text-white">
              {PLATFORM_TENANTS_TOUR_STEPS[tourStepIndex]?.title}
            </h3>
            <p className="text-sm text-gray-200 mt-2 leading-relaxed">
              {PLATFORM_TENANTS_TOUR_STEPS[tourStepIndex]?.description}
            </p>
            <p className="text-[11px] text-gray-400 mt-4">
              Passo {tourStepIndex + 1} de {PLATFORM_TENANTS_TOUR_STEPS.length}
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
                {tourStepIndex < PLATFORM_TENANTS_TOUR_STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setTourStepIndex((prev) =>
                        Math.min(PLATFORM_TENANTS_TOUR_STEPS.length - 1, prev + 1)
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
