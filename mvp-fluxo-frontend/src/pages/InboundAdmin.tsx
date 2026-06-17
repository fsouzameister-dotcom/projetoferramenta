import { useCallback, useEffect, useMemo, useState } from "react";
import api, { getApiErrorMessage, getApiOrigin, unwrapApiData } from "../api/client";
import InfoTooltip from "~components/InfoTooltip";

type FlowRow = { id: string; name: string; channel: string };

type WhatsAppChannel = {
  id: string;
  label: string;
  provider: string;
  twilio_account_sid?: string | null;
  phone_numbers: Array<{
    display_phone_number?: string | null;
    phone_number_id: string;
  }>;
};

function buildTwilioSourceKey(accountSid: string, phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `twilio:${accountSid.trim()}:${digits}`;
}

type InboundRoute = {
  id: string;
  label: string;
  source_type: string;
  source_key: string;
  flow_id: string;
  active: boolean;
};

const SOURCE_TYPE_OPTIONS = [
  { value: "whatsapp_meta", label: "WhatsApp — Meta (Cloud API)" },
  { value: "twilio_whatsapp", label: "WhatsApp — Twilio" },
  { value: "landing_page", label: "Landing page" },
  { value: "site_form", label: "Site — Fale conosco" },
  { value: "facebook_lead", label: "Facebook — Lead Ads" },
  { value: "instagram_lead", label: "Instagram — Lead Ads" },
  { value: "ctwa", label: "Click to WhatsApp (anúncio Meta)" },
  { value: "custom", label: "Personalizado" },
];

const SOURCE_KEY_HINTS: Record<string, string> = {
  whatsapp_meta: "meta:PHONE_NUMBER_ID (ex.: meta:1234567890)",
  twilio_whatsapp: "twilio:ACxxxx:5511999999999",
  landing_page: "lp_nome_da_campanha",
  site_form: "site_fale_conosco",
  facebook_lead: "fb_campanha_xyz",
  instagram_lead: "ig_campanha_xyz",
  ctwa: "ad_ID_DO_ANUNCIO ou default (qualquer CTWA)",
  custom: "identificador_livre",
};

export default function InboundAdmin() {
  const apiOrigin = getApiOrigin();
  const webhookUrl = `${apiOrigin}/webhooks/inbound`;

  const [routes, setRoutes] = useState<InboundRoute[]>([]);
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [whatsappChannels, setWhatsappChannels] = useState<WhatsAppChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    label: "",
    sourceType: "landing_page",
    sourceKey: "",
    flowId: "",
    active: true,
  });

  const flowNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of flows) map.set(f.id, f.name);
    return map;
  }, [flows]);

  const sourceKeyPlaceholder = SOURCE_KEY_HINTS[form.sourceType] ?? "chave_da_origem";

  const twilioKeyOptions = useMemo(() => {
    const options: Array<{ label: string; value: string }> = [];
    for (const channel of whatsappChannels) {
      if (channel.provider !== "twilio_whatsapp" || !channel.twilio_account_sid) continue;
      for (const phone of channel.phone_numbers) {
        const display = phone.display_phone_number?.trim() || phone.phone_number_id;
        const value = buildTwilioSourceKey(channel.twilio_account_sid, display);
        options.push({
          label: `${channel.label} — ${display}`,
          value,
        });
      }
    }
    return options;
  }, [whatsappChannels]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [routesRes, flowsRes, channelsRes] = await Promise.all([
        api.get("/inbound/routes"),
        api.get("/flows"),
        api.get("/whatsapp/channels"),
      ]);
      setRoutes(unwrapApiData<InboundRoute[]>(routesRes.data));
      setFlows(unwrapApiData<FlowRow[]>(flowsRes.data));
      setWhatsappChannels(unwrapApiData<WhatsAppChannel[]>(channelsRes.data));
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar rotas de entrada"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.post("/inbound/routes", {
        label: form.label,
        sourceType: form.sourceType,
        sourceKey: form.sourceKey,
        flowId: form.flowId,
        active: form.active,
      });
      setForm({
        label: "",
        sourceType: form.sourceType,
        sourceKey: "",
        flowId: form.flowId,
        active: true,
      });
      setNotice("Rota criada com sucesso.");
      await loadAll();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao criar rota"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (route: InboundRoute) => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/inbound/routes/${route.id}`, { active: !route.active });
      await loadAll();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao atualizar rota"));
    } finally {
      setSaving(false);
    }
  };

  const removeRoute = async (route: InboundRoute) => {
    if (!window.confirm(`Remover rota "${route.label}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/inbound/routes/${route.id}`);
      await loadAll();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao remover rota"));
    } finally {
      setSaving(false);
    }
  };

  const copyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setNotice("URL do webhook copiada.");
    } catch {
      setNotice("Não foi possível copiar automaticamente.");
    }
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Canais de entrada
            <InfoTooltip text="Defina qual origem (site, landing, WhatsApp, anúncios) dispara qual fluxo de atendimento." />
          </h1>
          <p className="text-sm text-gray-300 mt-1">
            Mapeie origens para fluxos: se o contato vier de X, encaminhe para o fluxo Y.
          </p>
        </div>
      </div>

      <div className="mt-4 bg-white rounded-xl p-4 border border-gray-100 text-sm text-gray-800">
        <p className="font-semibold text-gray-900">Webhook unificado (LP, site, leads)</p>
        <p className="mt-1 text-gray-600">
          POST com headers <code className="text-xs bg-gray-100 px-1 rounded">x-tenant-id</code> e{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">x-inbound-secret</code>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="text-xs bg-gray-50 border rounded px-2 py-1 break-all">{webhookUrl}</code>
          <button
            type="button"
            onClick={() => void copyWebhook()}
            className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
          >
            Copiar URL
          </button>
        </div>
        <pre className="mt-3 text-xs bg-gray-50 border rounded p-3 overflow-x-auto">{`{
  "sourceType": "landing_page",
  "sourceKey": "lp_consorcio",
  "message": "Quero simular",
  "phone": "+5511999999999",
  "name": "Maria"
}`}</pre>
      </div>

      {error ? (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mt-4 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="mt-6 bg-white rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        <input
          className="border rounded-lg px-3 py-2 text-gray-900 md:col-span-2"
          placeholder="Nome da regra (ex.: LP Consórcio → Qualificação)"
          value={form.label}
          onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
          required
        />
        <select
          className="border rounded-lg px-3 py-2 text-gray-900"
          value={form.sourceType}
          onChange={(e) => setForm((p) => ({ ...p, sourceType: e.target.value }))}
        >
          {SOURCE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {form.sourceType === "twilio_whatsapp" && twilioKeyOptions.length > 0 ? (
          <select
            className="border rounded-lg px-3 py-2 text-gray-900"
            value={form.sourceKey}
            onChange={(e) => setForm((p) => ({ ...p, sourceKey: e.target.value }))}
            required
          >
            <option value="">Selecione o número Twilio</option>
            {twilioKeyOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="border rounded-lg px-3 py-2 text-gray-900"
            placeholder={sourceKeyPlaceholder}
            value={form.sourceKey}
            onChange={(e) => setForm((p) => ({ ...p, sourceKey: e.target.value }))}
            required
          />
        )}
        {form.sourceType === "twilio_whatsapp" ? (
          <p className="text-xs text-gray-500 md:col-span-2">
            A chave deve seguir o formato <code className="bg-gray-100 px-1 rounded">twilio:ACxxxx:5511...</code>.
            O webhook Twilio envia essa chave completa; só o número sem prefixo não casa com a rota.
          </p>
        ) : null}
        <select
          className="border rounded-lg px-3 py-2 text-gray-900 md:col-span-2"
          value={form.flowId}
          onChange={(e) => setForm((p) => ({ ...p, flowId: e.target.value }))}
          required
        >
          <option value="">Selecione o fluxo de destino</option>
          {flows.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.channel})
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-800 md:col-span-2">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
          />
          Rota ativa
        </label>
        <button
          type="submit"
          disabled={saving}
          className="md:col-span-2 bg-accent text-white px-4 py-2 rounded-lg hover:bg-accent-dark disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Adicionar rota"}
        </button>
      </form>

      <div className="mt-6 bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left">Regra</th>
              <th className="px-4 py-3 text-left">Origem</th>
              <th className="px-4 py-3 text-left">Chave</th>
              <th className="px-4 py-3 text-left">Fluxo</th>
              <th className="px-4 py-3 text-left">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Carregando...
                </td>
              </tr>
            ) : routes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Nenhuma rota cadastrada.
                </td>
              </tr>
            ) : (
              routes.map((route) => (
                <tr key={route.id} className="border-t">
                  <td className="px-4 py-3 text-gray-900">{route.label}</td>
                  <td className="px-4 py-3 text-gray-700">{route.source_type}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{route.source_key}</td>
                  <td className="px-4 py-3 text-gray-800">
                    {flowNameById.get(route.flow_id) ?? route.flow_id}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-blue-600 hover:underline"
                        disabled={saving}
                        onClick={() => void toggleActive(route)}
                      >
                        {route.active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        className="text-red-600 hover:underline"
                        disabled={saving}
                        onClick={() => void removeRoute(route)}
                      >
                        Excluir
                      </button>
                    </div>
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
