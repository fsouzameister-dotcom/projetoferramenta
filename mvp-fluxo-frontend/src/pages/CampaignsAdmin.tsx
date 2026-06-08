import { useCallback, useEffect, useMemo, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import InfoTooltip from "~components/InfoTooltip";

type FlowRow = { id: string; name: string };
type ChannelRow = {
  id: string;
  label: string;
  provider: string;
  phone_numbers: Array<{ display_phone_number?: string | null }>;
};

type TemplateOption = {
  provider: string;
  templateId: string;
  displayName: string;
  language: string | null;
  variables: string[];
  bodyPreview: string;
  contentSid?: string;
  templateName?: string;
};

type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
  phoneColumn: string | null;
  sampleRow: Record<string, string>;
};

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  flow_id: string | null;
  metadata: {
    channelAccountId: string;
    template: TemplateOption;
    columnMapping: Record<string, string>;
    phoneColumn: string;
    sendIntervalSeconds: number;
  };
  stats?: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    responded: number;
  };
};

type RecipientRow = {
  id: string;
  phone_e164: string;
  status: string;
  error_description: string | null;
  sent_at: string | null;
  first_reply_text: string | null;
  first_reply_at: string | null;
};

const providerLabel = (p: string) =>
  p === "whatsapp_cloud_api" ? "Meta" : p === "twilio_whatsapp" ? "Twilio" : p;

const statusLabel: Record<string, string> = {
  draft: "Rascunho",
  sending: "Enviando",
  paused: "Pausada",
  completed: "Concluída",
  cancelled: "Cancelada",
  pending: "Pendente",
  sent: "Enviado",
  delivered: "Entregue",
  read: "Lido",
  failed: "Falhou",
  responded: "Respondido",
  skipped: "Ignorado",
};

export default function CampaignsAdmin() {
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [flowId, setFlowId] = useState("");
  const [channelAccountId, setChannelAccountId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [sendIntervalSeconds, setSendIntervalSeconds] = useState(3);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [phoneColumn, setPhoneColumn] = useState("Telefone");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [recipientStatusFilter, setRecipientStatusFilter] = useState("");
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.templateId === templateId) ?? null,
    [templates, templateId]
  );

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === channelAccountId) ?? null,
    [channels, channelAccountId]
  );

  const previewText = useMemo(() => {
    if (!selectedTemplate?.bodyPreview) return "";
    return selectedTemplate.bodyPreview.replace(/\{\{(\w+)\}\}/g, (_, slot: string) => {
      const col = columnMapping[slot];
      if (!col || !sheet?.sampleRow) return `{{${slot}}}`;
      return sheet.sampleRow[col]?.trim() || `{{${slot}}}`;
    });
  }, [selectedTemplate, columnMapping, sheet]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [flowsRes, channelsRes, campaignsRes] = await Promise.all([
        api.get("/admin/campaigns/options/flows"),
        api.get("/admin/campaigns/channels"),
        api.get("/admin/campaigns"),
      ]);
      setFlows(unwrapApiData<FlowRow[]>(flowsRes.data));
      setChannels(unwrapApiData<ChannelRow[]>(channelsRes.data));
      setCampaigns(unwrapApiData<CampaignRow[]>(campaignsRes.data));
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao carregar campanhas"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!channelAccountId) {
      setTemplates([]);
      setTemplateId("");
      return;
    }
    void (async () => {
      try {
        const res = await api.get("/admin/campaigns/templates", {
          params: { channelAccountId },
        });
        const list = unwrapApiData<TemplateOption[]>(res.data);
        setTemplates(list);
        if (list[0]) setTemplateId(list[0].templateId);
      } catch (e) {
        setError(getApiErrorMessage(e, "Erro ao carregar templates"));
      }
    })();
  }, [channelAccountId]);

  useEffect(() => {
    if (!selectedTemplate) return;
    const next: Record<string, string> = {};
    for (const slot of selectedTemplate.variables) {
      next[slot] = columnMapping[slot] ?? "";
    }
    setColumnMapping(next);
  }, [selectedTemplate?.templateId]);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    const contentBase64 = btoa(binary);
    try {
      const res = await api.post("/admin/campaigns/parse-spreadsheet", {
        filename: file.name,
        contentBase64,
      });
      const parsed = unwrapApiData<ParsedSheet>(res.data);
      setSheet(parsed);
      if (parsed.phoneColumn) setPhoneColumn(parsed.phoneColumn);
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao ler planilha"));
    }
  };

  const handleCreateAndDispatch = async () => {
    if (!name.trim() || !flowId || !channelAccountId || !selectedTemplate || !sheet?.rows.length) {
      setError("Preencha nome, fluxo, canal, template e planilha.");
      return;
    }
    for (const slot of selectedTemplate.variables) {
      if (!columnMapping[slot]?.trim()) {
        setError(`Selecione a coluna para a variável {{${slot}}}.`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const createRes = await api.post("/admin/campaigns", {
        name: name.trim(),
        flowId,
        channelAccountId,
        channelLabel: selectedChannel?.label,
        provider: selectedChannel?.provider,
        template: selectedTemplate,
        columnMapping,
        phoneColumn,
        sendIntervalSeconds,
        spreadsheetHeaders: sheet.headers,
        rows: sheet.rows,
      });
      const created = unwrapApiData<CampaignRow>(createRes.data);
      await api.post(`/admin/campaigns/${created.id}/dispatch`);
      setNotice(`Campanha "${created.name}" criada e disparo iniciado.`);
      setName("");
      setSheet(null);
      await loadBase();
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao criar/disparar campanha"));
    } finally {
      setSaving(false);
    }
  };

  const loadRecipients = useCallback(
    async (campaignId: string, status = recipientStatusFilter) => {
      setRecipientsLoading(true);
      try {
        const res = await api.get(`/admin/campaigns/${campaignId}/recipients`, {
          params: {
            ...(status ? { status } : {}),
            limit: 100,
          },
        });
        const data = unwrapApiData<{ items: RecipientRow[] }>(res.data);
        setRecipients(data.items ?? []);
      } catch (e) {
        setError(getApiErrorMessage(e, "Erro ao carregar destinatários"));
        setRecipients([]);
      } finally {
        setRecipientsLoading(false);
      }
    },
    [recipientStatusFilter]
  );

  const runCampaignAction = async (
    campaignId: string,
    action: "dispatch" | "pause" | "resume" | "cancel" | "retry-failed",
    successMsg: string
  ) => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/campaigns/${campaignId}/${action}`);
      setNotice(successMsg);
      await loadBase();
      if (selectedCampaignId === campaignId) {
        await loadRecipients(campaignId);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro na operação da campanha"));
    } finally {
      setSaving(false);
    }
  };

  const openRecipients = async (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    await loadRecipients(campaignId);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto text-gray-100">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-2xl font-semibold text-white">Campanhas</h1>
        <InfoTooltip text="Disparo em massa de templates WhatsApp (Twilio ou Meta). As respostas entram no fluxo selecionado." />
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Upload de planilha CSV/Excel com coluna <strong>Telefone</strong> e mapeamento dinâmico das variáveis do template.
      </p>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 mb-8">
        <h2 className="text-lg font-medium text-white mb-4">Nova campanha</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-gray-400 mb-1 block">Nome da campanha</span>
            <input
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-400 mb-1 block">Fluxo de destino das respostas</span>
            <select
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
              value={flowId}
              onChange={(e) => setFlowId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-400 mb-1 block">Canal WhatsApp</span>
            <select
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
              value={channelAccountId}
              onChange={(e) => setChannelAccountId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({providerLabel(c.provider)})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-400 mb-1 block">Template</span>
            <select
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
              value={templateId}
              disabled={!channelAccountId || templates.length === 0}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.templateId} value={t.templateId}>
                  {t.displayName}
                  {t.language ? ` — ${t.language}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-400 mb-1 block">Intervalo entre disparos (segundos)</span>
            <input
              type="number"
              min={1}
              max={120}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
              value={sendIntervalSeconds}
              onChange={(e) => setSendIntervalSeconds(Number(e.target.value) || 3)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-400 mb-1 block">Planilha (CSV ou Excel)</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="w-full text-sm"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {sheet ? (
          <p className="text-xs text-gray-400 mt-3">
            {sheet.rows.length} linha(s) · colunas: {sheet.headers.join(", ")}
          </p>
        ) : null}

        {selectedTemplate && selectedTemplate.variables.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            {selectedTemplate.variables.map((slot) => (
              <label key={slot} className="block text-sm">
                <span className="text-gray-400 mb-1 block">Campo — {`{{${slot}}}`}</span>
                <select
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
                  value={columnMapping[slot] ?? ""}
                  onChange={(e) =>
                    setColumnMapping((prev) => ({ ...prev, [slot]: e.target.value }))
                  }
                >
                  <option value="">Selecione a coluna…</option>
                  {(sheet?.headers ?? []).map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : selectedTemplate ? (
          <p className="text-sm text-gray-400 mt-4">Este template não possui variáveis no corpo.</p>
        ) : null}

        {previewText ? (
          <div className="mt-5">
            <span className="text-gray-400 text-sm block mb-1">Frase do template (pré-visualização)</span>
            <div className="rounded-lg bg-zinc-950 border border-zinc-700 p-3 text-sm whitespace-pre-wrap">
              {previewText}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleCreateAndDispatch()}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium"
          >
            {saving ? "Processando…" : "Salvar e disparar"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5">
        <h2 className="text-lg font-medium text-white mb-4">Campanhas</h2>
        {loading ? (
          <p className="text-gray-400 text-sm">Carregando…</p>
        ) : campaigns.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhuma campanha ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-zinc-700">
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Enviados</th>
                  <th className="py-2 pr-3">Falhas</th>
                  <th className="py-2 pr-3">Respondidos</th>
                  <th className="py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-800">
                    <td className="py-2 pr-3">{c.name}</td>
                    <td className="py-2 pr-3">{statusLabel[c.status] ?? c.status}</td>
                    <td className="py-2 pr-3">{c.stats?.total ?? 0}</td>
                    <td className="py-2 pr-3">{c.stats?.sent ?? 0}</td>
                    <td className="py-2 pr-3">{c.stats?.failed ?? 0}</td>
                    <td className="py-2 pr-3">{c.stats?.responded ?? 0}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          className="text-cyan-400 hover:underline disabled:opacity-40"
                          disabled={saving}
                          onClick={() => void openRecipients(c.id)}
                        >
                          Destinatários
                        </button>
                        {(c.status === "draft" || (c.stats?.pending ?? 0) > 0) &&
                        c.status !== "cancelled" &&
                        c.status !== "sending" ? (
                          <button
                            type="button"
                            className="text-cyan-400 hover:underline disabled:opacity-40"
                            disabled={saving}
                            onClick={() =>
                              void runCampaignAction(c.id, "dispatch", "Disparo iniciado.")
                            }
                          >
                            Disparar
                          </button>
                        ) : null}
                        {c.status === "sending" ? (
                          <button
                            type="button"
                            className="text-amber-400 hover:underline disabled:opacity-40"
                            disabled={saving}
                            onClick={() =>
                              void runCampaignAction(c.id, "pause", "Campanha pausada.")
                            }
                          >
                            Pausar
                          </button>
                        ) : null}
                        {c.status === "paused" ? (
                          <button
                            type="button"
                            className="text-cyan-400 hover:underline disabled:opacity-40"
                            disabled={saving}
                            onClick={() =>
                              void runCampaignAction(c.id, "resume", "Campanha retomada.")
                            }
                          >
                            Retomar
                          </button>
                        ) : null}
                        {(c.stats?.failed ?? 0) > 0 && c.status !== "cancelled" ? (
                          <button
                            type="button"
                            className="text-emerald-400 hover:underline disabled:opacity-40"
                            disabled={saving}
                            onClick={() =>
                              void runCampaignAction(
                                c.id,
                                "retry-failed",
                                "Falhas reenfileiradas para reenvio."
                              )
                            }
                          >
                            Retry falhas
                          </button>
                        ) : null}
                        {["draft", "sending", "paused"].includes(c.status) ? (
                          <button
                            type="button"
                            className="text-red-400 hover:underline disabled:opacity-40"
                            disabled={saving}
                            onClick={() =>
                              void runCampaignAction(c.id, "cancel", "Campanha cancelada.")
                            }
                          >
                            Cancelar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedCampaignId ? (
        <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-medium text-white">Destinatários</h2>
            <div className="flex items-center gap-2">
              <select
                className="rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-1.5 text-sm"
                value={recipientStatusFilter}
                onChange={(e) => {
                  setRecipientStatusFilter(e.target.value);
                  void loadRecipients(selectedCampaignId, e.target.value);
                }}
              >
                <option value="">Todos os status</option>
                {Object.entries(statusLabel).map(([key, label]) =>
                  ["pending", "sending", "sent", "delivered", "read", "failed", "responded", "skipped"].includes(
                    key
                  ) ? (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ) : null
                )}
              </select>
              <button
                type="button"
                className="text-sm text-gray-400 hover:text-white"
                onClick={() => setSelectedCampaignId(null)}
              >
                Fechar
              </button>
            </div>
          </div>
          {recipientsLoading ? (
            <p className="text-gray-400 text-sm">Carregando destinatários…</p>
          ) : recipients.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhum destinatário encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-zinc-700">
                    <th className="py-2 pr-3">Telefone</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Enviado em</th>
                    <th className="py-2 pr-3">1ª resposta</th>
                    <th className="py-2">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800">
                      <td className="py-2 pr-3 text-cyan-300">{r.phone_e164}</td>
                      <td className="py-2 pr-3">{statusLabel[r.status] ?? r.status}</td>
                      <td className="py-2 pr-3">
                        {r.sent_at ? new Date(r.sent_at).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="py-2 pr-3 max-w-xs truncate">
                        {r.first_reply_text
                          ? `${r.first_reply_text}${r.first_reply_at ? ` (${new Date(r.first_reply_at).toLocaleString("pt-BR")})` : ""}`
                          : "—"}
                      </td>
                      <td className="py-2 text-red-300 text-xs">{r.error_description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
