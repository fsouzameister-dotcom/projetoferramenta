import { useEffect, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";

interface Flow {
  id: string;
  name: string;
  channel: string;
  is_active: boolean;
  created_at: string;
}

interface UserRow {
  id: string;
  role_name: string;
}

interface WhatsAppChannel {
  id: string;
}

interface TwilioTemplate {
  contentSid: string;
}

export default function Dashboard() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [channels, setChannels] = useState<WhatsAppChannel[]>([]);
  const [templates, setTemplates] = useState<TwilioTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [channelFilter, setChannelFilter] = useState("todos");
  const [campaignFilter, setCampaignFilter] = useState("todas");

  useEffect(() => {
    const apiOrigin =
      import.meta.env.VITE_API_URL?.replace(/\/$/, "") ??
      "http://localhost:3000";

    fetch(`${apiOrigin}/health`)
      .then((res) => {
        setApiOnline(res.ok);
      })
      .catch(() => {
        setApiOnline(false);
      });

    setLoading(true);
    setError(null);

    void Promise.allSettled([
      api.get("/flows"),
      api.get("/users"),
      api.get("/whatsapp/channels"),
      api.get("/agent/twilio/content-templates"),
    ])
      .then((results) => {
        const [flowsResult, usersResult, channelsResult, templatesResult] = results;

        if (flowsResult.status === "fulfilled") {
          setFlows(unwrapApiData<Flow[]>(flowsResult.value.data));
          setError(null);
        } else {
          const err = flowsResult.reason;
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            setError("Sessao invalida ou expirada. Faca login novamente.");
          } else if (status === 400) {
            setError("Tenant ausente na sessao. Faca login novamente.");
          } else {
            setError(
              getApiErrorMessage(
                err,
                "Nao foi possivel carregar os fluxos. Verifique backend e conectividade."
              )
            );
          }
          setFlows([]);
        }

        if (usersResult.status === "fulfilled") {
          setUsers(unwrapApiData<UserRow[]>(usersResult.value.data));
        } else {
          setUsers([]);
        }

        if (channelsResult.status === "fulfilled") {
          setChannels(unwrapApiData<WhatsAppChannel[]>(channelsResult.value.data));
        } else {
          setChannels([]);
        }

        if (templatesResult.status === "fulfilled") {
          const payload = unwrapApiData<TwilioTemplate[]>(templatesResult.value.data);
          setTemplates(Array.isArray(payload) ? payload : []);
        } else {
          setTemplates([]);
        }
      })
      .finally(() => setLoading(false));
  }, []); // O array de dependências está vazio, pois o tenantId não é mais uma dependência direta aqui.

  const normalizeChannel = (channel?: string) =>
    (channel || "desconhecido").toLowerCase();

  const inferCampaign = (name: string) => {
    // Se existir o padrao "Campanha - Nome", usa o prefixo como campanha.
    const [maybeCampaign] = name.split(" - ");
    return maybeCampaign?.trim() || "Geral";
  };

  const channelOptions = Array.from(
    new Set(flows.map((f) => normalizeChannel(f.channel)))
  );
  const campaignOptions = Array.from(new Set(flows.map((f) => inferCampaign(f.name))));

  const filteredFlows = flows.filter((f) => {
    const channelOk =
      channelFilter === "todos" || normalizeChannel(f.channel) === channelFilter;
    const campaignOk =
      campaignFilter === "todas" || inferCampaign(f.name) === campaignFilter;
    return channelOk && campaignOk;
  });

  const totalFlows = filteredFlows.length;
  const activeFlows = filteredFlows.filter((f) => f.is_active).length;
  const inactiveFlows = totalFlows - activeFlows;
  const hasActiveFlow = flows.some((flow) => flow.is_active);
  const hasWhatsAppChannel = channels.length > 0;
  const hasAgentUser = users.some((user) => user.role_name === "agente");
  const hasTwilioTemplate = templates.length > 0;

  const checklist = [
    {
      id: "whatsapp",
      label: "Canal WhatsApp configurado",
      ok: hasWhatsAppChannel,
    },
    {
      id: "flow",
      label: "Pelo menos 1 fluxo ativo",
      ok: hasActiveFlow,
    },
    {
      id: "agent",
      label: "Pelo menos 1 usuário agente",
      ok: hasAgentUser,
    },
    {
      id: "template",
      label: "Pelo menos 1 template aprovado",
      ok: hasTwilioTemplate,
    },
  ];
  const checklistDone = checklist.filter((item) => item.ok).length;
  const checklistPercent = Math.round((checklistDone / checklist.length) * 100);

  const channelGroups = filteredFlows.reduce<Record<string, number>>((acc, flow) => {
    const key = normalizeChannel(flow.channel);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const maxChannelCount = Math.max(1, ...Object.values(channelGroups));

  return (
    <div className="p-4 lg:p-5">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-300 mt-1">
          Visao geral dos seus fluxos de atendimento
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold text-primary">
            Checklist de configuracao minima do tenant
          </h2>
          <span className="text-sm font-semibold text-teal-700">
            {loading ? "..." : `${checklistPercent}% pronto`}
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
          <div
            className="h-2 bg-teal-500 rounded-full transition-all"
            style={{ width: `${loading ? 0 : checklistPercent}%` }}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {checklist.map((item) => (
            <div
              key={item.id}
              className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${
                item.ok
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-amber-50 border-amber-200 text-amber-800"
              }`}
            >
              <span>{item.ok ? "✅" : "⚠️"}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <label className="block text-sm text-gray-500 mb-2">Canal</label>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="todos">Todos os canais</option>
            {channelOptions.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
          <label className="block text-sm text-gray-500 mb-2">Campanha</label>
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="todas">Todas as campanhas</option>
            {campaignOptions.map((campaign) => (
              <option key={campaign} value={campaign}>
                {campaign}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">Total de Fluxos</p>
          <p className="text-2xl font-bold text-primary mt-1">
            {loading ? "—" : totalFlows}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">Fluxos Ativos</p>
          <p className="text-2xl font-bold text-green-500 mt-1">
            {loading ? "—" : activeFlows}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">Fluxos Inativos</p>
          <p className="text-2xl font-bold text-gray-400 mt-1">
            {loading ? "—" : inactiveFlows}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm text-gray-500">Status API</p>
          <p
            className={`text-2xl font-bold mt-1 ${
              apiOnline === false ? "text-red-500" : "text-green-500"
            }`}
          >
            {apiOnline === null ? "—" : apiOnline ? "Online" : "Offline"}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-600 rounded-xl px-6 py-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <h2 className="text-lg font-semibold text-primary mb-4">
          Volume de Fluxos por Canal
        </h2>
        <div className="space-y-3">
          {Object.keys(channelGroups).length === 0 ? (
            <p className="text-sm text-gray-400">
              Nenhum dado para os filtros selecionados.
            </p>
          ) : (
            Object.entries(channelGroups).map(([channel, count]) => {
              const width = Math.max(8, Math.round((count / maxChannelCount) * 100));
              return (
                <div key={channel}>
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span className="capitalize">{channel}</span>
                    <span>{count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-teal-500 rounded-full"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h2 className="text-lg font-semibold text-primary mb-2">Resumo do Painel</h2>
        <p className="text-sm text-gray-600">
          A criacao e gerenciamento de fluxos fica centralizada no menu lateral em{" "}
          <strong>Fluxos</strong>.
        </p>
      </div>
    </div>
  );
}