import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { getApiErrorMessage, unwrapApiData } from "~api/client";
import {
  getHomeTenantId,
  isPlatformAdmin,
  setActingTenant,
} from "~lib/session";
import InfoTooltip from "~components/InfoTooltip";
import {
  getPasswordPolicyError,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
} from "~lib/password-policy";
import {
  getTenantSlugClientError,
  normalizeTenantSlug,
  slugifyTenantName,
} from "~lib/tenant-slug";

type SlugCheckResult = {
  slug: string;
  available: boolean;
  valid: boolean;
  issue: "INVALID_SLUG" | "SLUG_ALREADY_EXISTS" | null;
  message: string;
};

type SlugStatus = "idle" | "checking" | "available" | "unavailable" | "invalid";

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
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [slugMessage, setSlugMessage] = useState<string | null>(null);
  const [validatingSlug, setValidatingSlug] = useState(false);
  const slugCheckTimerRef = useRef<number | null>(null);

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

  const applySlugCheckResult = (result: SlugCheckResult) => {
    setForm((current) =>
      current.slug === result.slug ? current : { ...current, slug: result.slug }
    );
    if (!result.valid) {
      setSlugStatus("invalid");
      setSlugMessage(result.message);
      return;
    }
    if (result.available) {
      setSlugStatus("available");
      setSlugMessage(result.message);
      return;
    }
    setSlugStatus("unavailable");
    setSlugMessage(result.message);
  };

  const validateSlug = useCallback(
    async (input?: { slug?: string; name?: string }) => {
      const slug = normalizeTenantSlug(input?.slug ?? form.slug);
      const name = (input?.name ?? form.name).trim();
      const clientError = getTenantSlugClientError(slug);
      if (clientError) {
        setSlugStatus("invalid");
        setSlugMessage(clientError);
        return false;
      }
      if (!slug && !name) {
        setSlugStatus("idle");
        setSlugMessage(null);
        return false;
      }

      setValidatingSlug(true);
      setSlugStatus("checking");
      try {
        const res = await api.get("/platform/tenants/check-slug", {
          params: {
            ...(slug ? { slug } : {}),
            ...(name ? { name } : {}),
          },
          headers: { "x-tenant-id": getHomeTenantId() },
        });
        const result = unwrapApiData<SlugCheckResult>(res.data);
        applySlugCheckResult(result);
        return result.valid && result.available;
      } catch (err: unknown) {
        setSlugStatus("invalid");
        setSlugMessage(getApiErrorMessage(err, "Não foi possível validar o slug"));
        return false;
      } finally {
        setValidatingSlug(false);
      }
    },
    [form.name, form.slug]
  );

  useEffect(() => {
    if (slugCheckTimerRef.current) {
      window.clearTimeout(slugCheckTimerRef.current);
    }
    const slug = normalizeTenantSlug(form.slug);
    const name = form.name.trim();
    if (!slug && !name) {
      setSlugStatus("idle");
      setSlugMessage(null);
      return;
    }

    slugCheckTimerRef.current = window.setTimeout(() => {
      void validateSlug({ slug, name });
    }, 500);

    return () => {
      if (slugCheckTimerRef.current) {
        window.clearTimeout(slugCheckTimerRef.current);
      }
    };
  }, [form.slug, form.name, validateSlug]);

  const handleNameChange = (name: string) => {
    setForm((current) => {
      const next = { ...current, name };
      if (!slugManuallyEdited) {
        next.slug = slugifyTenantName(name);
      }
      return next;
    });
  };

  const handleSlugChange = (slug: string) => {
    setSlugManuallyEdited(true);
    setForm((current) => ({ ...current, slug }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const passwordError = getPasswordPolicyError(form.initial_admin_password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    const slugOk = await validateSlug();
    if (!slugOk) {
      setError(slugMessage || "Valide o slug antes de criar o tenant.");
      return;
    }

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
      setSlugManuallyEdited(false);
      setSlugStatus("idle");
      setSlugMessage(null);
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
            <p className="text-sm text-gray-300 mt-1 flex items-center gap-2">
              Gerencie ambientes de clientes e abra o tenant para configurar fluxos, WhatsApp e
              agentes com acesso master.
              <InfoTooltip text="Cada tenant isola dados, fluxos e usuários. Use esta tela para criar e entrar no ambiente correto do cliente." />
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
        <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          Novo cliente
          <InfoTooltip text="Cria o tenant e o admin inicial em uma única etapa para acelerar o onboarding." />
        </h2>
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
                <span className="text-gray-300 flex items-center gap-1">
                  Nome
                  <InfoTooltip text="O slug interno é gerado automaticamente a partir do nome. Você pode editá-lo e validar antes de criar." />
                </span>
                <input
                  required
                  className="mt-1.5 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-white"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
              </label>
              <label className="block text-sm sm:col-span-1">
                <span className="text-gray-300">Slug (URL interna)</span>
                <div className="mt-1.5 flex gap-2">
                  <input
                    required
                    className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-white"
                    value={form.slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    onBlur={() => {
                      const normalized = normalizeTenantSlug(form.slug);
                      if (normalized !== form.slug) {
                        setForm((current) => ({ ...current, slug: normalized }));
                      }
                    }}
                    placeholder="gerado-automaticamente"
                  />
                  <button
                    type="button"
                    onClick={() => void validateSlug()}
                    disabled={validatingSlug || (!form.slug.trim() && !form.name.trim())}
                    className="shrink-0 rounded-lg border border-cyan-500/50 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                  >
                    {validatingSlug ? "Validando…" : "Validar slug"}
                  </button>
                </div>
                <p
                  className={`mt-1 text-xs ${
                    slugStatus === "available"
                      ? "text-emerald-400"
                      : slugStatus === "checking"
                        ? "text-cyan-300"
                        : slugStatus === "unavailable" || slugStatus === "invalid"
                          ? "text-amber-300"
                          : "text-gray-400"
                  }`}
                >
                  {slugStatus === "idle"
                    ? "O slug é sugerido automaticamente pelo nome do cliente."
                    : slugMessage}
                </p>
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
                  minLength={PASSWORD_MIN_LENGTH}
                  className="mt-1.5 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 text-white"
                  value={form.initial_admin_password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, initial_admin_password: e.target.value }))
                  }
                />
                <p className="mt-1 text-xs text-gray-400">{PASSWORD_POLICY_MESSAGE}</p>
              </label>
            </div>
          </fieldset>

          <div className="pt-2">
            <button
              type="submit"
              disabled={
                creating ||
                validatingSlug ||
                slugStatus === "invalid" ||
                slugStatus === "unavailable" ||
                slugStatus === "checking" ||
                slugStatus === "idle"
              }
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
                  title="Entra no tenant selecionado para configurar operação."
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
