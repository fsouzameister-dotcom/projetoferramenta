import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import api, { getApiErrorMessage, getApiOrigin, unwrapApiData } from "../api/client";

type PhoneNumber = {
  id: string;
  channel_account_id: string;
  phone_number_id: string;
  display_phone_number?: string | null;
};

type Channel = {
  id: string;
  tenant_id: string;
  label: string;
  provider: string;
  waba_id: string;
  twilio_account_sid?: string | null;
  phone_numbers: PhoneNumber[];
  created_at?: string;
};

/** Valores enviados ao backend; expandir quando novos BSPs forem implementados. */
type ImplementedChannelId = "whatsapp_cloud_api" | "twilio_whatsapp";

const initialMetaCreds = {
  wabaId: "",
  accessToken: "",
  phoneNumberId: "",
  displayPhoneNumber: "",
};

const initialTwilioCreds = {
  accountSid: "",
  authToken: "",
  fromWhatsApp: "",
};

/** Lista única para o dropdown (padrão multicanal / BSP). */
const CHANNEL_OPTIONS: {
  id: ImplementedChannelId;
  label: string;
  hint: string;
}[] = [
  {
    id: "whatsapp_cloud_api",
    label: "WhatsApp — Meta (Cloud API)",
    hint: "Conexão direta com a Graph API (opção B): WABA, Phone Number ID e token.",
  },
  {
    id: "twilio_whatsapp",
    label: "WhatsApp — Twilio",
    hint: "API REST Twilio: Account SID, Auth Token e número WhatsApp aprovado na Twilio.",
  },
];

/** BSPs exibidos como “em roadmap” (sem valor selecionável ainda). */
const CHANNEL_PLANNED_LABELS = [
  "Zenvia — WhatsApp",
  "Gupshup — WhatsApp",
  "360dialog — WhatsApp",
  "PontalTech — SMS",
  "Conectly",
  "Whapi",
];

function providerDisplayName(provider: string): string {
  if (provider === "twilio_whatsapp") return "WhatsApp — Twilio";
  if (provider === "whatsapp_cloud_api") return "WhatsApp — Meta (Cloud API)";
  return provider;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type ServerWhatsAppSettings = {
  meta: {
    webhookVerifyTokenConfigured: boolean;
    appSecretConfigured: boolean;
  };
  flags: {
    whatsappSkipSignatureVerify: boolean;
    twilioSkipSignatureVerify: boolean;
  };
};

export default function WhatsAppAdmin() {
  const apiOrigin = getApiOrigin();
  const metaWebhookUrl = `${apiOrigin}/webhooks/whatsapp`;
  const twilioInboundUrl = `${apiOrigin}/webhooks/twilio/messages`;
  const twilioStatusUrl = `${apiOrigin}/webhooks/twilio/status`;

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConnect, setSavingConnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedChannelId, setSelectedChannelId] = useState<ImplementedChannelId | "">("");
  const [channelLabel, setChannelLabel] = useState("");
  const [metaCreds, setMetaCreds] = useState(initialMetaCreds);
  const [twilioCreds, setTwilioCreds] = useState(initialTwilioCreds);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  /** Diagnóstico: qual bundle JS o browser carregou (deve mudar após cada deploy). */
  const [entryScriptSrc, setEntryScriptSrc] = useState<string>("");

  const [serverSettings, setServerSettings] = useState<ServerWhatsAppSettings | null>(null);
  const [loadingServerSettings, setLoadingServerSettings] = useState(true);
  const [savingServerSettings, setSavingServerSettings] = useState(false);
  const [serverMetaVerifyToken, setServerMetaVerifyToken] = useState("");
  const [serverMetaAppSecret, setServerMetaAppSecret] = useState("");
  const [flagSkipMetaSig, setFlagSkipMetaSig] = useState(false);
  const [flagSkipTwilioSig, setFlagSkipTwilioSig] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/whatsapp/channels");
      setChannels(unwrapApiData<Channel[]>(res.data));
      setError(null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar canais WhatsApp"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadServerSettings = useCallback(async () => {
    setLoadingServerSettings(true);
    try {
      const res = await api.get("/whatsapp/server-settings");
      const data = unwrapApiData<ServerWhatsAppSettings>(res.data);
      setServerSettings(data);
      setFlagSkipMetaSig(data.flags.whatsappSkipSignatureVerify);
      setFlagSkipTwilioSig(data.flags.twilioSkipSignatureVerify);
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar configurações globais do WhatsApp"));
    } finally {
      setLoadingServerSettings(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadServerSettings();
  }, [load, loadServerSettings]);

  useEffect(() => {
    const el = document.querySelector('script[type="module"][src]') as HTMLScriptElement | null;
    setEntryScriptSrc(el?.getAttribute("src")?.trim() || "(não encontrado)");
  }, []);

  const flashCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    setCopyHint(ok ? "URL copiada." : "Não foi possível copiar automaticamente.");
    window.setTimeout(() => setCopyHint(null), 2500);
  };

  const selectedOption = CHANNEL_OPTIONS.find((o) => o.id === selectedChannelId);

  const onSaveServerSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSavingServerSettings(true);
    setError(null);
    setNotice(null);
    try {
      await api.patch("/whatsapp/server-settings", {
        metaWebhookVerifyToken: serverMetaVerifyToken.trim() || undefined,
        metaAppSecret: serverMetaAppSecret.trim() || undefined,
        whatsappSkipSignatureVerify: flagSkipMetaSig,
        twilioSkipSignatureVerify: flagSkipTwilioSig,
      });
      setServerMetaVerifyToken("");
      setServerMetaAppSecret("");
      setNotice("Configurações globais salvas no servidor.");
      await loadServerSettings();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao salvar configurações globais"));
    } finally {
      setSavingServerSettings(false);
    }
  };

  const onConnectSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const labelTrim = channelLabel.trim();
    if (!selectedChannelId) {
      setError("Selecione um canal (provedor) antes de preencher as credenciais.");
      return;
    }
    if (labelTrim.length < 2) {
      setError("Informe um nome para esta conexão (mínimo 2 caracteres).");
      return;
    }

    setSavingConnect(true);
    setError(null);
    setNotice(null);
    try {
      if (selectedChannelId === "whatsapp_cloud_api") {
        await api.post("/whatsapp/channels", {
          label: labelTrim,
          wabaId: metaCreds.wabaId.trim(),
          accessToken: metaCreds.accessToken.trim(),
          phoneNumberId: metaCreds.phoneNumberId.trim(),
          displayPhoneNumber: metaCreds.displayPhoneNumber.trim() || undefined,
        });
        setMetaCreds(initialMetaCreds);
        setNotice("Conexão Meta (Cloud API) registrada. Um número fica vinculado só a este provedor.");
      } else if (selectedChannelId === "twilio_whatsapp") {
        await api.post("/whatsapp/channels/twilio", {
          label: labelTrim,
          accountSid: twilioCreds.accountSid.trim(),
          authToken: twilioCreds.authToken.trim(),
          fromWhatsApp: twilioCreds.fromWhatsApp.trim(),
        });
        setTwilioCreds(initialTwilioCreds);
        setNotice("Conexão Twilio registrada. Um número fica vinculado só a este provedor.");
      }
      setChannelLabel("");
      setSelectedChannelId("");
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao registrar conexão"));
    } finally {
      setSavingConnect(false);
    }
  };

  const startEdit = (ch: Channel) => {
    setEditingId(ch.id);
    setEditLabel(ch.label || "WhatsApp");
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
  };

  const saveEdit = async (channelId: string) => {
    const trimmed = editLabel.trim();
    if (trimmed.length < 1) {
      setError("O nome do canal não pode ficar vazio.");
      return;
    }
    setSavingEditId(channelId);
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/whatsapp/channels/${channelId}`, { label: trimmed });
      setNotice("Nome da conexão atualizado.");
      setEditingId(null);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao atualizar nome do canal"));
    } finally {
      setSavingEditId(null);
    }
  };

  const removeChannel = async (channelId: string, displayName: string) => {
    const ok = window.confirm(
      `Remover a conexão "${displayName}"? As credenciais e números vinculados serão apagados. Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    setDeletingId(channelId);
    setError(null);
    setNotice(null);
    try {
      await api.delete(`/whatsapp/channels/${channelId}`);
      setNotice("Conexão removida.");
      if (editingId === channelId) cancelEdit();
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao remover conexão"));
    } finally {
      setDeletingId(null);
    }
  };

  const isTwilioProvider = (p: string) => p === "twilio_whatsapp";

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white">Canais WhatsApp</h1>
      <p className="text-sm text-gray-300 mt-1">
        Cada número é cadastrado em <strong className="text-gray-200">um único provedor por vez</strong> (sem misturar
        Meta e Twilio no mesmo vínculo). Você pode ter várias conexões no tenant — por exemplo uma linha na Meta e
        outra na Twilio.
      </p>
      <p className="text-xs text-gray-400 mt-1">
        Envio automático: se existir Meta e Twilio no mesmo tenant, a Meta tem prioridade na fila atual do backend.
      </p>
      <p className="text-[10px] text-slate-500 mt-2 font-mono break-all" title="Se após deploy esta linha não mudar, o servidor ou CDN ainda entrega build antigo.">
        UI multicanal · bundle: {entryScriptSrc || "…"}
      </p>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <section className="mt-6 bg-white rounded-xl border border-slate-300 p-6 text-sm text-gray-800">
        <h2 className="text-lg font-semibold text-gray-900">Configuração global (Meta webhooks)</h2>
        <p className="text-xs text-gray-600 mt-1 max-w-3xl">
          Estes valores ficam no <strong>banco de dados</strong> (cifrados) e substituem{" "}
          <span className="font-mono">WHATSAPP_WEBHOOK_VERIFY_TOKEN</span> e{" "}
          <span className="font-mono">WHATSAPP_APP_SECRET</span> do <span className="font-mono">.env</span> quando
          preenchidos aqui — não é necessário alterar código para trocar esses segredos.{" "}
          <strong>Credenciais por canal</strong> (WABA / Twilio por número) continuam em{" "}
          <strong>Nova conexão</strong> abaixo.
        </p>
        {loadingServerSettings ? (
          <p className="mt-4 text-gray-500">Carregando configurações…</p>
        ) : (
          <form onSubmit={onSaveServerSettings} className="mt-4 space-y-4 max-w-xl">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-600">
              <span>
                Verify token:{" "}
                <strong className={serverSettings?.meta.webhookVerifyTokenConfigured ? "text-emerald-700" : "text-amber-700"}>
                  {serverSettings?.meta.webhookVerifyTokenConfigured ? "configurado" : "não configurado"}
                </strong>
              </span>
              <span>
                App Secret:{" "}
                <strong className={serverSettings?.meta.appSecretConfigured ? "text-emerald-700" : "text-amber-700"}>
                  {serverSettings?.meta.appSecretConfigured ? "configurado" : "não configurado"}
                </strong>
              </span>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="srv-verify">
                Novo verify token (Meta GET webhook)
              </label>
              <input
                id="srv-verify"
                type="password"
                autoComplete="off"
                className="w-full border rounded-lg px-3 py-2 text-gray-900 font-mono text-xs"
                placeholder="Deixe em branco para manter o atual"
                value={serverMetaVerifyToken}
                onChange={(e) => setServerMetaVerifyToken(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="srv-secret">
                Novo App Secret (Meta assinatura POST)
              </label>
              <input
                id="srv-secret"
                type="password"
                autoComplete="off"
                className="w-full border rounded-lg px-3 py-2 text-gray-900 font-mono text-xs"
                placeholder="Deixe em branco para manter o atual"
                value={serverMetaAppSecret}
                onChange={(e) => setServerMetaAppSecret(e.target.value)}
              />
            </div>
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <p className="text-xs text-amber-800 font-medium">Apenas desenvolvimento / diagnóstico</p>
              <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flagSkipMetaSig}
                  onChange={(e) => setFlagSkipMetaSig(e.target.checked)}
                />
                Não validar assinatura Meta (<span className="font-mono">X-Hub-Signature-256</span>)
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={flagSkipTwilioSig}
                  onChange={(e) => setFlagSkipTwilioSig(e.target.checked)}
                />
                Não validar assinatura Twilio (<span className="font-mono">X-Twilio-Signature</span>)
              </label>
            </div>
            <button
              type="submit"
              disabled={savingServerSettings}
              className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-slate-900 disabled:opacity-50"
            >
              {savingServerSettings ? "Salvando…" : "Salvar configuração global"}
            </button>
          </form>
        )}
      </section>

      <section className="mt-6 bg-slate-900/60 border border-slate-700 rounded-xl p-5 text-sm text-gray-200">
        <h2 className="text-base font-semibold text-white mb-2">Webhooks e variáveis do servidor</h2>
        <p className="text-gray-400 text-xs mb-3">
          Garanta que o proxy encaminhe <span className="font-mono">/webhooks/</span> para o backend (não só{" "}
          <span className="font-mono">/api/</span>).
        </p>

        <div className="border-t border-slate-700 pt-4 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-cyan-200/90 uppercase tracking-wide mb-2">Meta (Cloud API)</h3>
            <p className="text-gray-400 text-xs mb-2">
              O app na Meta aponta para estes endpoints. O tenant é resolvido pelo{" "}
              <span className="font-mono">phone_number_id</span> nos eventos.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <code className="font-mono text-xs text-amber-100/95 break-all bg-black/30 px-2 py-1 rounded">
                {metaWebhookUrl}
              </code>
              <button
                type="button"
                onClick={() => void flashCopy(metaWebhookUrl)}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded-lg"
              >
                Copiar URL
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Variáveis: <span className="font-mono text-gray-300">WHATSAPP_WEBHOOK_VERIFY_TOKEN</span>,{" "}
              <span className="font-mono text-gray-300">WHATSAPP_APP_SECRET</span>. Desenvolvimento:{" "}
              <span className="font-mono text-gray-300">WHATSAPP_SKIP_SIGNATURE_VERIFY=true</span> (não use em
              produção).
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-violet-200/90 uppercase tracking-wide mb-2">Twilio</h3>
            <p className="text-gray-400 text-xs mb-2">
              No console Twilio, configure o número WhatsApp: <strong className="text-gray-300">mensagem recebida</strong>{" "}
              e <strong className="text-gray-300">status</strong> nas URLs abaixo (POST,{" "}
              <span className="font-mono">application/x-www-form-urlencoded</span>).
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-gray-500 uppercase">Inbound (quando chegar mensagem)</p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <code className="font-mono text-xs text-amber-100/95 break-all bg-black/30 px-2 py-1 rounded">
                    {twilioInboundUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void flashCopy(twilioInboundUrl)}
                    className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded-lg"
                  >
                    Copiar
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase">Status (entrega / leitura)</p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <code className="font-mono text-xs text-amber-100/95 break-all bg-black/30 px-2 py-1 rounded">
                    {twilioStatusUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => void flashCopy(twilioStatusUrl)}
                    className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded-lg"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              A assinatura usa o <strong className="text-gray-300">Auth Token</strong> do mesmo subconta/canal. Em
              desenvolvimento local: <span className="font-mono text-gray-300">TWILIO_SKIP_SIGNATURE_VERIFY=true</span>{" "}
              (nunca em produção).
            </p>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-500">
          <p className="font-mono text-[10px] text-gray-600">Base da API (VITE_API_URL): {apiOrigin}</p>
          {copyHint && <p className="text-emerald-400 mt-1">{copyHint}</p>}
        </div>
      </section>

      <form
        onSubmit={onConnectSubmit}
        className="mt-6 bg-white rounded-xl border border-slate-300 p-6 space-y-4"
      >
        <div className="border-b border-gray-200 pb-3">
          <h2 className="text-lg font-semibold text-gray-900">Nova conexão</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Escolha o canal (BSP / API) e preencha as credenciais desse provedor apenas.
          </p>
        </div>

        <div>
          <label htmlFor="channel-select" className="block text-sm font-medium text-gray-800 mb-1">
            Canal
          </label>
          <select
            id="channel-select"
            className="w-full max-w-xl border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 text-sm bg-white"
            value={selectedChannelId}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedChannelId(v as ImplementedChannelId | "");
              setError(null);
            }}
          >
            <option value="">Selecione um canal…</option>
            <optgroup label="Disponível agora">
              {CHANNEL_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Em roadmap (mesmo padrão da lista, integração pendente)">
              {CHANNEL_PLANNED_LABELS.map((label, i) => (
                <option key={label} value={`__planned_${i}`} disabled>
                  {label}
                </option>
              ))}
            </optgroup>
          </select>
          {selectedOption && (
            <p className="text-xs text-gray-500 mt-2 max-w-2xl">{selectedOption.hint}</p>
          )}
        </div>

        {selectedChannelId ? (
          <>
            <input
              className="w-full max-w-xl border rounded-lg px-3 py-2 text-gray-900"
              placeholder="Nome desta conexão (ex.: Atendimento BR, Twilio — filial SP)"
              value={channelLabel}
              onChange={(e) => setChannelLabel(e.target.value)}
              required
              minLength={2}
              aria-required
            />

            {selectedChannelId === "whatsapp_cloud_api" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <input
                  className="border rounded-lg px-3 py-2 text-gray-900"
                  placeholder="WABA ID (WhatsApp Business Account ID)"
                  value={metaCreds.wabaId}
                  onChange={(e) => setMetaCreds((p) => ({ ...p, wabaId: e.target.value }))}
                  required
                />
                <input
                  className="border rounded-lg px-3 py-2 text-gray-900"
                  placeholder="Phone Number ID (Meta)"
                  value={metaCreds.phoneNumberId}
                  onChange={(e) => setMetaCreds((p) => ({ ...p, phoneNumberId: e.target.value }))}
                  required
                />
                <input
                  className="border rounded-lg px-3 py-2 text-gray-900 md:col-span-2"
                  placeholder="Telefone display (opcional, ex.: +55 11 99999-9999)"
                  value={metaCreds.displayPhoneNumber}
                  onChange={(e) => setMetaCreds((p) => ({ ...p, displayPhoneNumber: e.target.value }))}
                />
                <input
                  className="border rounded-lg px-3 py-2 text-gray-900 font-mono text-xs md:col-span-2"
                  placeholder="Access Token permanente (System User)"
                  value={metaCreds.accessToken}
                  onChange={(e) => setMetaCreds((p) => ({ ...p, accessToken: e.target.value }))}
                  type="password"
                  required
                />
              </div>
            )}

            {selectedChannelId === "twilio_whatsapp" && (
              <div className="grid grid-cols-1 gap-3 pt-1 max-w-xl">
                <input
                  className="border rounded-lg px-3 py-2 text-gray-900 font-mono text-xs"
                  placeholder="Account SID (AC…)"
                  value={twilioCreds.accountSid}
                  onChange={(e) => setTwilioCreds((p) => ({ ...p, accountSid: e.target.value }))}
                  required
                  minLength={34}
                  autoComplete="off"
                />
                <input
                  className="border rounded-lg px-3 py-2 text-gray-900 font-mono text-xs"
                  placeholder="Auth Token"
                  value={twilioCreds.authToken}
                  onChange={(e) => setTwilioCreds((p) => ({ ...p, authToken: e.target.value }))}
                  type="password"
                  required
                  minLength={8}
                />
                <input
                  className="border rounded-lg px-3 py-2 text-gray-900"
                  placeholder="Número WhatsApp Twilio (E.164), ex.: +551150284949"
                  value={twilioCreds.fromWhatsApp}
                  onChange={(e) => setTwilioCreds((p) => ({ ...p, fromWhatsApp: e.target.value }))}
                  required
                  minLength={8}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                Credenciais cifradas em repouso (AES-256-GCM).
              </span>
              <button
                type="submit"
                disabled={savingConnect}
                className={`px-5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${
                  selectedChannelId === "twilio_whatsapp"
                    ? "bg-violet-600 hover:bg-violet-700"
                    : "bg-accent hover:bg-accent-dark"
                }`}
              >
                {savingConnect ? "Salvando…" : "Conectar número"}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">Selecione um canal acima para ver os campos de credencial.</p>
        )}
      </form>

      <div className="mt-8 bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b text-sm font-semibold text-gray-700">
          Conexões cadastradas
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-6 text-sm text-gray-500">Carregando...</div>
          ) : channels.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">Nenhuma conexão ainda.</div>
          ) : (
            channels.map((channel) => (
              <div key={channel.id} className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    {editingId === channel.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="border rounded-lg px-3 py-2 text-gray-900 text-sm min-w-[12rem] flex-1 max-w-md"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          aria-label="Novo nome da conexão"
                        />
                        <button
                          type="button"
                          disabled={savingEditId === channel.id}
                          onClick={() => void saveEdit(channel.id)}
                          className="text-sm bg-accent text-white px-3 py-2 rounded-lg hover:bg-accent-dark disabled:opacity-50"
                        >
                          {savingEditId === channel.id ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          type="button"
                          disabled={savingEditId === channel.id}
                          onClick={cancelEdit}
                          className="text-sm border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-gray-900">
                          {channel.label || "WhatsApp"}{" "}
                          <span className="text-xs font-normal text-gray-500">
                            — {providerDisplayName(channel.provider)}
                          </span>
                        </p>
                        {isTwilioProvider(channel.provider) ? (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Account SID:{" "}
                            <span className="font-mono">{channel.twilio_account_sid || "—"}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500 mt-0.5">
                            WABA: <span className="font-mono">{channel.waba_id || "—"}</span>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  {editingId !== channel.id && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(channel)}
                        className="text-sm text-accent hover:underline"
                      >
                        Renomear
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === channel.id}
                        onClick={() => void removeChannel(channel.id, channel.label || "WhatsApp")}
                        className="text-sm text-red-600 hover:underline disabled:opacity-50"
                      >
                        {deletingId === channel.id ? "Removendo..." : "Remover"}
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {channel.phone_numbers.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50"
                    >
                      <p className="text-gray-900 font-medium">
                        {p.display_phone_number || "(número sem display)"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {isTwilioProvider(channel.provider) ? (
                          <>
                            ID interno: <span className="font-mono">{p.phone_number_id}</span>
                          </>
                        ) : (
                          <>
                            Phone Number ID: <span className="font-mono">{p.phone_number_id}</span>
                          </>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="mt-8 text-[10px] text-slate-600 max-w-3xl leading-relaxed">
        Se você <strong className="text-slate-400">não</strong> vê o bloco &quot;Configuração global&quot;, o dropdown
        &quot;Canal&quot; e &quot;Nova conexão&quot;, faça deploy de novo o diretório <span className="font-mono">dist/</span>{" "}
        para o mesmo <span className="font-mono">DocumentRoot</span> do Apache do app e confira se não há outro
        virtual host servindo este domínio. No servidor:{" "}
        <span className="font-mono">curl -s https://app.clienton.com.br/ | grep script</span>
      </p>
    </div>
  );
}
