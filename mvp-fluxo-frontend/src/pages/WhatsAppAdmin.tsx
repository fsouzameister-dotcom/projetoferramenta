import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import api, { getApiErrorMessage, getApiOrigin, unwrapApiData } from "../api/client";
import BotSafeguardPanel from "../components/BotSafeguardPanel";
import InfoTooltip from "~components/InfoTooltip";
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
  adminModalClass,
  adminModalOverlayClass,
  adminNoticeClass,
  adminPageShellClass,
  adminPanelClass,
  adminSectionClass,
  adminSelectClass,
} from "~lib/admin-ui";

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

const WHATSAPP_ADMIN_TOUR_STORAGE_KEY = "whatsapp_admin_tour_completed_v1";
const WHATSAPP_ADMIN_TOUR_STEPS = [
  {
    title: "Configuração global",
    description:
      "Defina verify token, app secret e flags de validação de assinatura para Meta e Twilio no servidor.",
  },
  {
    title: "Nova conexão",
    description:
      "Escolha o provedor e cadastre credenciais por canal para conectar números WhatsApp ao tenant.",
  },
  {
    title: "Conexões cadastradas",
    description:
      "Gerencie conexões existentes, renomeie e remova canais, além de revisar números vinculados.",
  },
] as const;

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
  const [showTour, setShowTour] = useState(false);
  const [tourStepIndex, setTourStepIndex] = useState(0);

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

  useEffect(() => {
    const completed = localStorage.getItem(WHATSAPP_ADMIN_TOUR_STORAGE_KEY) === "true";
    if (!completed) {
      setTourStepIndex(0);
      setShowTour(true);
    }
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

  const handleCloseTour = () => {
    setShowTour(false);
    localStorage.setItem(WHATSAPP_ADMIN_TOUR_STORAGE_KEY, "true");
  };

  const handleOpenTour = () => {
    setTourStepIndex(0);
    setShowTour(true);
  };

  const checkboxClass = "rounded border-zinc-600 bg-zinc-900 accent-cyan-500";

  return (
    <div className={adminPageShellClass(true)}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Canais WhatsApp</h1>
          <p className="text-sm text-gray-300 mt-1 flex items-center gap-2">
            Cada número é cadastrado em <strong className="text-gray-200">um único provedor por vez</strong> (sem
            misturar Meta e Twilio no mesmo vínculo). Você pode ter várias conexões no tenant — por exemplo uma linha
            na Meta e outra na Twilio.
            <InfoTooltip text="Evite duplicar o mesmo número em provedores diferentes para não causar conflito de roteamento." />
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Envio automático: se existir Meta e Twilio no mesmo tenant, a Meta tem prioridade na fila atual do backend.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenTour}
          className="w-8 h-8 rounded-full border border-cyan-400/60 text-cyan-200 hover:bg-cyan-500/10 text-sm shrink-0"
          title="Reabrir tour do WhatsApp"
          aria-label="Reabrir tour do WhatsApp"
        >
          ?
        </button>
      </header>
      <p
        className="text-[10px] text-slate-500 font-mono break-all"
        title="Se após deploy esta linha não mudar, o servidor ou CDN ainda entrega build antigo."
      >
        UI multicanal · bundle: {entryScriptSrc || "…"}
      </p>

      {error ? <div className={adminErrorClass}>{error}</div> : null}
      {notice ? <div className={adminNoticeClass}>{notice}</div> : null}

      <BotSafeguardPanel variant="compact" />

      <section className={`${adminSectionClass} text-sm`}>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          Configuração global (Meta webhooks)
          <InfoTooltip text="Essas configurações são globais no servidor e afetam a validação dos webhooks da Meta/Twilio." />
        </h2>
        <p className="text-xs text-gray-400 mt-1 max-w-3xl">
          Estes valores ficam no <strong className="text-gray-300">banco de dados</strong> (cifrados) e substituem{" "}
          <code className={`${adminCodeClass} px-1 py-0.5`}>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> e{" "}
          <code className={`${adminCodeClass} px-1 py-0.5`}>WHATSAPP_APP_SECRET</code> do{" "}
          <code className={`${adminCodeClass} px-1 py-0.5`}>.env</code> quando preenchidos aqui — não é necessário
          alterar código para trocar esses segredos. <strong className="text-gray-300">Credenciais por canal</strong>{" "}
          (WABA / Twilio por número) continuam em <strong className="text-gray-300">Nova conexão</strong> abaixo.
        </p>
        {loadingServerSettings ? (
          <p className="mt-4 text-gray-400">Carregando configurações…</p>
        ) : (
          <form onSubmit={onSaveServerSettings} className="mt-4 space-y-4 max-w-xl">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-400">
              <span>
                Verify token:{" "}
                <strong
                  className={
                    serverSettings?.meta.webhookVerifyTokenConfigured ? "text-emerald-300" : "text-amber-300"
                  }
                >
                  {serverSettings?.meta.webhookVerifyTokenConfigured ? "configurado" : "não configurado"}
                </strong>
              </span>
              <span>
                App Secret:{" "}
                <strong
                  className={serverSettings?.meta.appSecretConfigured ? "text-emerald-300" : "text-amber-300"}
                >
                  {serverSettings?.meta.appSecretConfigured ? "configurado" : "não configurado"}
                </strong>
              </span>
            </div>
            <label className={adminLabelClass} htmlFor="srv-verify">
              Novo verify token (Meta GET webhook)
              <input
                id="srv-verify"
                type="password"
                autoComplete="off"
                className={`${adminInputClass} font-mono text-xs`}
                placeholder="Deixe em branco para manter o atual"
                value={serverMetaVerifyToken}
                onChange={(e) => setServerMetaVerifyToken(e.target.value)}
              />
            </label>
            <label className={adminLabelClass} htmlFor="srv-secret">
              Novo App Secret (Meta assinatura POST)
              <input
                id="srv-secret"
                type="password"
                autoComplete="off"
                className={`${adminInputClass} font-mono text-xs`}
                placeholder="Deixe em branco para manter o atual"
                value={serverMetaAppSecret}
                onChange={(e) => setServerMetaAppSecret(e.target.value)}
              />
            </label>
            <div className="space-y-2 border-t border-zinc-700/80 pt-3">
              <p className="text-xs text-amber-300 font-medium">Apenas desenvolvimento / diagnóstico</p>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={flagSkipMetaSig}
                  onChange={(e) => setFlagSkipMetaSig(e.target.checked)}
                />
                Não validar assinatura Meta (<span className="font-mono">X-Hub-Signature-256</span>)
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  className={checkboxClass}
                  checked={flagSkipTwilioSig}
                  onChange={(e) => setFlagSkipTwilioSig(e.target.checked)}
                />
                Não validar assinatura Twilio (<span className="font-mono">X-Twilio-Signature</span>)
              </label>
            </div>
            <button type="submit" disabled={savingServerSettings} className={adminBtnPrimaryClass}>
              {savingServerSettings ? "Salvando…" : "Salvar configuração global"}
            </button>
          </form>
        )}
      </section>

      <section className={`${adminSectionClass} text-sm`}>
        <h2 className="text-base font-semibold text-white mb-2">Webhooks e variáveis do servidor</h2>
        <p className="text-gray-400 text-xs mb-3">
          Garanta que o proxy encaminhe <span className="font-mono">/webhooks/</span> para o backend (não só{" "}
          <span className="font-mono">/api/</span>).
        </p>

        <div className="border-t border-zinc-700/80 pt-4 space-y-4">
          <div>
            <h3 className={adminLegendClass}>Meta (Cloud API)</h3>
            <p className="text-gray-400 text-xs mb-2 mt-2">
              O app na Meta aponta para estes endpoints. O tenant é resolvido pelo{" "}
              <span className="font-mono">phone_number_id</span> nos eventos.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <code className={adminCodeClass}>{metaWebhookUrl}</code>
              <button type="button" onClick={() => void flashCopy(metaWebhookUrl)} className={adminBtnSecondaryClass}>
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
            <h3 className={`${adminLegendClass} text-violet-200/90`}>Twilio</h3>
            <p className="text-gray-400 text-xs mb-2 mt-2">
              No console Twilio, configure o número WhatsApp:{" "}
              <strong className="text-gray-300">mensagem recebida</strong> e{" "}
              <strong className="text-gray-300">status</strong> nas URLs abaixo (POST,{" "}
              <span className="font-mono">application/x-www-form-urlencoded</span>).
            </p>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-gray-500 uppercase">Inbound (quando chegar mensagem)</p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <code className={adminCodeClass}>{twilioInboundUrl}</code>
                  <button
                    type="button"
                    onClick={() => void flashCopy(twilioInboundUrl)}
                    className={adminBtnSecondaryClass}
                  >
                    Copiar
                  </button>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase">Status (entrega / leitura)</p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <code className={adminCodeClass}>{twilioStatusUrl}</code>
                  <button
                    type="button"
                    onClick={() => void flashCopy(twilioStatusUrl)}
                    className={adminBtnSecondaryClass}
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
          {copyHint ? <p className="text-emerald-400 mt-1">{copyHint}</p> : null}
        </div>
      </section>

      <form onSubmit={onConnectSubmit} className={`${adminSectionClass} space-y-4`}>
        <div className="border-b border-zinc-700/80 pb-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            Nova conexão
            <InfoTooltip text="Cadastre um canal por vez com as credenciais corretas do provedor selecionado." />
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Escolha o canal (BSP / API) e preencha as credenciais desse provedor apenas.
          </p>
        </div>

        <div>
          <label htmlFor="channel-select" className={adminLabelClass}>
            Canal
          </label>
          <select
            id="channel-select"
            className={`${adminSelectClass} max-w-xl`}
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
          {selectedOption && <p className="text-xs text-gray-400 mt-2 max-w-2xl">{selectedOption.hint}</p>}
        </div>

        {selectedChannelId ? (
          <>
            <input
              className={`${adminInputClass} max-w-xl`}
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
                  className={adminInputClass}
                  placeholder="WABA ID (WhatsApp Business Account ID)"
                  value={metaCreds.wabaId}
                  onChange={(e) => setMetaCreds((p) => ({ ...p, wabaId: e.target.value }))}
                  required
                />
                <input
                  className={adminInputClass}
                  placeholder="Phone Number ID (Meta)"
                  value={metaCreds.phoneNumberId}
                  onChange={(e) => setMetaCreds((p) => ({ ...p, phoneNumberId: e.target.value }))}
                  required
                />
                <input
                  className={`${adminInputClass} md:col-span-2`}
                  placeholder="Telefone display (opcional, ex.: +55 11 99999-9999)"
                  value={metaCreds.displayPhoneNumber}
                  onChange={(e) => setMetaCreds((p) => ({ ...p, displayPhoneNumber: e.target.value }))}
                />
                <input
                  className={`${adminInputClass} font-mono text-xs md:col-span-2`}
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
                  className={`${adminInputClass} font-mono text-xs`}
                  placeholder="Account SID (AC…)"
                  value={twilioCreds.accountSid}
                  onChange={(e) => setTwilioCreds((p) => ({ ...p, accountSid: e.target.value }))}
                  required
                  minLength={34}
                  autoComplete="off"
                />
                <input
                  className={`${adminInputClass} font-mono text-xs`}
                  placeholder="Auth Token"
                  value={twilioCreds.authToken}
                  onChange={(e) => setTwilioCreds((p) => ({ ...p, authToken: e.target.value }))}
                  type="password"
                  required
                  minLength={8}
                />
                <input
                  className={adminInputClass}
                  placeholder="Número WhatsApp Twilio (E.164), ex.: +551150284949"
                  value={twilioCreds.fromWhatsApp}
                  onChange={(e) => setTwilioCreds((p) => ({ ...p, fromWhatsApp: e.target.value }))}
                  required
                  minLength={8}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-700/80">
              <span className="text-xs text-gray-500">Credenciais cifradas em repouso (AES-256-GCM).</span>
              <button
                type="submit"
                disabled={savingConnect}
                className={`${adminBtnPrimaryClass} disabled:opacity-50 ${
                  selectedChannelId === "twilio_whatsapp" ? "bg-violet-600 hover:bg-violet-700" : ""
                }`}
              >
                {savingConnect ? "Salvando…" : "Conectar número"}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">Selecione um canal acima para ver os campos de credencial.</p>
        )}
      </form>

      <div className={adminPanelClass}>
        <div className="px-4 py-3 border-b border-zinc-700/80 text-sm font-semibold text-white">
          Conexões cadastradas
        </div>
        <div className="divide-y divide-zinc-700/60">
          {loading ? (
            <div className="p-6 text-sm text-gray-400">Carregando...</div>
          ) : channels.length === 0 ? (
            <div className="p-6 text-sm text-gray-400">Nenhuma conexão ainda.</div>
          ) : (
            channels.map((channel) => (
              <div key={channel.id} className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    {editingId === channel.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className={`${adminInputClass} mt-0 min-w-[12rem] flex-1 max-w-md`}
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          aria-label="Novo nome da conexão"
                        />
                        <button
                          type="button"
                          disabled={savingEditId === channel.id}
                          onClick={() => void saveEdit(channel.id)}
                          className={adminBtnPrimaryClass}
                        >
                          {savingEditId === channel.id ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          type="button"
                          disabled={savingEditId === channel.id}
                          onClick={cancelEdit}
                          className={adminBtnSecondaryClass}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-white">
                          {channel.label || "WhatsApp"}{" "}
                          <span className="text-xs font-normal text-gray-400">
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
                      <button type="button" onClick={() => startEdit(channel)} className={adminBtnLinkClass}>
                        Renomear
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === channel.id}
                        onClick={() => void removeChannel(channel.id, channel.label || "WhatsApp")}
                        className={adminBtnDangerClass}
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
                      className="rounded-lg border border-zinc-600/60 bg-zinc-900/50 px-3 py-2 text-sm"
                    >
                      <p className="text-white font-medium">
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

      <p className="text-[10px] text-slate-600 max-w-3xl leading-relaxed">
        Se você <strong className="text-slate-400">não</strong> vê o bloco &quot;Configuração global&quot;, o dropdown
        &quot;Canal&quot; e &quot;Nova conexão&quot;, faça deploy de novo o diretório <span className="font-mono">dist/</span>{" "}
        para o mesmo <span className="font-mono">DocumentRoot</span> do Apache do app e confira se não há outro
        virtual host servindo este domínio. No servidor:{" "}
        <span className="font-mono">curl -s https://app.clienton.com.br/ | grep script</span>
      </p>
      {showTour ? (
        <div className={adminModalOverlayClass}>
          <div className={adminModalClass}>
            <p className="text-[11px] uppercase tracking-wide text-cyan-300 mb-1">
              Tour do WhatsApp admin
            </p>
            <h3 className="text-lg font-semibold text-white">
              {WHATSAPP_ADMIN_TOUR_STEPS[tourStepIndex]?.title}
            </h3>
            <p className="text-sm text-gray-200 mt-2 leading-relaxed">
              {WHATSAPP_ADMIN_TOUR_STEPS[tourStepIndex]?.description}
            </p>
            <p className="text-[11px] text-gray-400 mt-4">
              Passo {tourStepIndex + 1} de {WHATSAPP_ADMIN_TOUR_STEPS.length}
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
                {tourStepIndex < WHATSAPP_ADMIN_TOUR_STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setTourStepIndex((prev) =>
                        Math.min(WHATSAPP_ADMIN_TOUR_STEPS.length - 1, prev + 1)
                      )
                    }
                    className={adminBtnPrimaryClass}
                  >
                    Próximo
                  </button>
                ) : (
                  <button type="button" onClick={handleCloseTour} className={adminBtnPrimaryClass}>
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
