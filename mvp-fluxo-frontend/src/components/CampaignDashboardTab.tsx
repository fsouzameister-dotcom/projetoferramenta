import { useCallback, useEffect, useMemo, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

type CampaignOption = { id: string; name: string };

type DashboardMetrics = {
  total: number;
  pending: number;
  skipped: number;
  failed: number;
  dispatched: number;
  sent: number;
  delivered: number;
  read: number;
  responded: number;
};

type DashboardData = {
  summary: DashboardMetrics;
  byCampaign: Array<{
    campaignId: string;
    campaignName: string;
    campaignStatus: string;
    metrics: DashboardMetrics;
  }>;
  timeline: Array<{ date: string; dispatched: number; responded: number }>;
};

const funnelSteps: Array<{
  key: keyof Pick<
    DashboardMetrics,
    "dispatched" | "sent" | "delivered" | "read" | "responded"
  >;
  label: string;
  hint: string;
  color: string;
}> = [
  {
    key: "dispatched",
    label: "Disparados",
    hint: "Mensagens enviadas ao provedor (API)",
    color: "bg-sky-500",
  },
  {
    key: "sent",
    label: "Enviados",
    hint: "Confirmados como enviados pelo WhatsApp",
    color: "bg-cyan-500",
  },
  {
    key: "delivered",
    label: "Recebidos",
    hint: "Entregues no aparelho do destinatário",
    color: "bg-teal-500",
  },
  {
    key: "read",
    label: "Lidos",
    hint: "Visualizados pelo destinatário",
    color: "bg-emerald-500",
  },
  {
    key: "responded",
    label: "Respondidos",
    hint: "Destinatário respondeu à campanha",
    color: "bg-lime-500",
  },
];

function pct(value: number, base: number): string {
  if (!base) return "0%";
  return `${Math.round((value / base) * 100)}%`;
}

function FunnelBar({
  label,
  hint,
  value,
  max,
  color,
}: {
  label: string;
  hint: string;
  value: number;
  max: number;
  color: string;
}) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-200" title={hint}>
          {label}
        </span>
        <span className="text-gray-400 tabular-nums">
          {value.toLocaleString("pt-BR")}{" "}
          <span className="text-gray-500">({pct(value, max)})</span>
        </span>
      </div>
      <div className="h-8 rounded-lg bg-zinc-800/80 border border-zinc-700 overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500 rounded-r-lg`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${accent ?? "text-white"}`}>
        {value.toLocaleString("pt-BR")}
      </p>
      {sub ? <p className="text-xs text-gray-500 mt-1">{sub}</p> : null}
    </div>
  );
}

type Props = {
  campaigns: CampaignOption[];
};

export default function CampaignDashboardTab({ campaigns }: Props) {
  const [campaignId, setCampaignId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/admin/campaigns/dashboard", {
        params: {
          ...(campaignId ? { campaignId } : {}),
          ...(from ? { from: `${from}T00:00:00.000Z` } : {}),
          ...(to ? { to: `${to}T23:59:59.999Z` } : {}),
        },
      });
      setData(unwrapApiData<DashboardData>(res.data));
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao carregar dashboard"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.summary;
  const funnelMax = summary?.dispatched ?? 0;

  const responseRate = useMemo(() => {
    if (!summary?.dispatched) return 0;
    return Math.round((summary.responded / summary.dispatched) * 100);
  }, [summary]);

  const deliveryRate = useMemo(() => {
    if (!summary?.dispatched) return 0;
    return Math.round((summary.delivered / summary.dispatched) * 100);
  }, [summary]);

  const maxTimeline = useMemo(() => {
    if (!data?.timeline.length) return 1;
    return Math.max(
      1,
      ...data.timeline.map((p) => Math.max(p.dispatched, p.responded))
    );
  }, [data?.timeline]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-end">
        <label className="text-sm block">
          <span className="text-gray-400 mb-1 block">Campanha</span>
          <select
            className="rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 min-w-[200px]"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
          >
            <option value="">Todas as campanhas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm block">
          <span className="text-gray-400 mb-1 block">De</span>
          <input
            type="date"
            className="rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-sm block">
          <span className="text-gray-400 mb-1 block">Até</span>
          <input
            type="date"
            className="rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm"
        >
          Atualizar
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando métricas…</p>
      ) : !summary ? (
        <p className="text-gray-400 text-sm">Sem dados para exibir.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <MetricCard label="Total na base" value={summary.total} />
            <MetricCard label="Disparados" value={summary.dispatched} accent="text-sky-300" />
            <MetricCard
              label="Taxa entrega"
              value={deliveryRate}
              sub={`${summary.delivered} recebidos · ${deliveryRate}%`}
              accent="text-teal-300"
            />
            <MetricCard
              label="Taxa resposta"
              value={responseRate}
              sub={`${summary.responded} respostas · ${responseRate}%`}
              accent="text-lime-300"
            />
            <MetricCard label="Pendentes" value={summary.pending} accent="text-amber-300" />
            <MetricCard label="Falhas" value={summary.failed} accent="text-red-300" />
          </div>

          <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5">
            <h3 className="text-lg font-medium text-white mb-1">Funil de disparo</h3>
            <p className="text-xs text-gray-500 mb-5">
              Percentuais calculados sobre o total de disparados.
            </p>
            <div className="space-y-4 max-w-3xl">
              {funnelSteps.map((step) => (
                <FunnelBar
                  key={step.key}
                  label={step.label}
                  hint={step.hint}
                  value={summary[step.key]}
                  max={funnelMax}
                  color={step.color}
                />
              ))}
            </div>
          </section>

          {data.timeline.length > 0 ? (
            <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5">
              <h3 className="text-lg font-medium text-white mb-4">Disparos por dia</h3>
              <div className="flex items-end gap-2 h-40 overflow-x-auto pb-2">
                {data.timeline.map((point) => (
                  <div
                    key={point.date}
                    className="flex flex-col items-center gap-1 min-w-[48px] flex-shrink-0"
                    title={`${point.date}: ${point.dispatched} disparos, ${point.responded} respostas`}
                  >
                    <div className="flex items-end gap-0.5 h-28 w-full justify-center">
                      <div
                        className="w-3 bg-sky-500/90 rounded-t"
                        style={{
                          height: `${Math.max(4, (point.dispatched / maxTimeline) * 100)}%`,
                        }}
                      />
                      <div
                        className="w-3 bg-lime-500/90 rounded-t"
                        style={{
                          height: `${Math.max(4, (point.responded / maxTimeline) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 rotate-0">
                      {point.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 text-xs text-gray-400 mt-2">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-sky-500 rounded-sm inline-block" /> Disparados
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-lime-500 rounded-sm inline-block" /> Respondidos
                </span>
              </div>
            </section>
          ) : null}

          {data.byCampaign.length > 1 && !campaignId ? (
            <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 overflow-x-auto">
              <h3 className="text-lg font-medium text-white mb-4">Por campanha</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-zinc-700">
                    <th className="py-2 pr-3">Campanha</th>
                    <th className="py-2 pr-3">Disparados</th>
                    <th className="py-2 pr-3">Recebidos</th>
                    <th className="py-2 pr-3">Lidos</th>
                    <th className="py-2 pr-3">Respondidos</th>
                    <th className="py-2">Falhas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byCampaign.map((row) => (
                    <tr key={row.campaignId} className="border-b border-zinc-800">
                      <td className="py-2 pr-3 text-gray-200">{row.campaignName}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.metrics.dispatched}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.metrics.delivered}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.metrics.read}</td>
                      <td className="py-2 pr-3 tabular-nums text-lime-300">
                        {row.metrics.responded}
                      </td>
                      <td className="py-2 tabular-nums text-red-300">{row.metrics.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
