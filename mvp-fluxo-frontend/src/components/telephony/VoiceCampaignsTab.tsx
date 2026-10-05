import { useCallback, useEffect, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../../api/client";
import {
  adminBtnDangerClass,
  adminBtnLinkClass,
  adminBtnPrimaryClass,
  adminBtnSecondaryClass,
  adminInputClass,
  adminLabelClass,
  adminPanelClass,
  adminSectionClass,
  adminSelectClass,
  adminTableHeadClass,
  adminTableRowClass,
} from "~lib/admin-ui";
import {
  formatCallDateTime,
  voiceCampaignStatusLabel,
  type VoiceCampaignStatus,
  type VoiceCampaignSummary,
  type VoiceImportResult,
  type VoiceSpreadsheetPreview,
} from "~lib/telephony";

type Queue = { id: string; label: string };
type Mode =
  | null
  | { kind: "create" }
  | { kind: "edit"; campaign: VoiceCampaignSummary }
  | { kind: "import"; campaign: VoiceCampaignSummary };

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

function importSummary(r: VoiceImportResult): string {
  const parts = [`${r.imported} contato(s) importado(s)`];
  if (r.duplicates) parts.push(`${r.duplicates} duplicado(s) ignorado(s)`);
  if (r.invalidCount) {
    const sample = r.invalid
      .slice(0, 5)
      .map((i) => `linha ${i.line}${i.value ? ` (${i.value})` : ""}`)
      .join(", ");
    parts.push(`${r.invalidCount} telefone(s) inválido(s): ${sample}${r.invalidCount > 5 ? "…" : ""}`);
  }
  return parts.join(" · ");
}

export default function VoiceCampaignsTab(props: {
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const { setError, setNotice } = props;
  const [campaigns, setCampaigns] = useState<VoiceCampaignSummary[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, q] = await Promise.all([api.get("/admin/telephony/campaigns"), api.get("/admin/telephony/queues")]);
      setCampaigns(unwrapApiData<VoiceCampaignSummary[]>(c.data));
      setQueues(unwrapApiData<Queue[]>(q.data));
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao carregar campanhas"));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (campaign: VoiceCampaignSummary, status: VoiceCampaignStatus) => {
    if (status === "completed" && !window.confirm(`Encerrar a campanha "${campaign.name}"? Os atendentes deixam de vê-la.`)) {
      return;
    }
    setSavingId(campaign.id);
    setError(null);
    setNotice(null);
    try {
      const res = await api.put(`/admin/telephony/campaigns/${campaign.id}`, { status });
      const updated = unwrapApiData<VoiceCampaignSummary>(res.data);
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setNotice(`Campanha "${updated.name}": ${voiceCampaignStatusLabel[updated.status].toLowerCase()}.`);
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao alterar campanha"));
    } finally {
      setSavingId(null);
    }
  };

  const onSaved = (message: string) => {
    setMode(null);
    setNotice(message);
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400 max-w-3xl">
          Mailing exclusivo de telefonia (separado dos disparos de WhatsApp). O atendente escolhe a campanha no Discador e
          clica em <strong className="text-gray-200">Pedir próximo contato</strong>: o sistema reserva o contato e já disca.
          Não atendidas voltam para a fila após o intervalo, até o limite de tentativas.
        </p>
        <div className="flex gap-2">
          <button type="button" className={adminBtnSecondaryClass} onClick={() => void load()} disabled={loading}>
            {loading ? "Carregando..." : "Atualizar"}
          </button>
          <button
            type="button"
            className={adminBtnPrimaryClass}
            onClick={() => {
              setError(null);
              setNotice(null);
              setMode({ kind: "create" });
            }}
          >
            Nova campanha
          </button>
        </div>
      </div>

      {mode ? (
        <CampaignForm
          key={mode.kind === "create" ? "create" : `${mode.kind}-${mode.campaign.id}`}
          mode={mode}
          queues={queues}
          onCancel={() => setMode(null)}
          onSaved={onSaved}
          setError={setError}
        />
      ) : null}

      <div className={`${adminPanelClass} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className={adminTableHeadClass}>
            <tr>
              <th className="px-4 py-3">Campanha</th>
              <th className="px-4 py-3">Filas</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Progresso</th>
              <th className="px-4 py-3">Disponíveis</th>
              <th className="px-4 py-3">Regras</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? (
              <tr className={adminTableRowClass}>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma campanha de voz. Clique em “Nova campanha” e importe a planilha de contatos.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => {
                const finished = c.counts.done + c.counts.exhausted + c.counts.doNotCall;
                const pct = c.counts.total ? Math.round((finished / c.counts.total) * 100) : 0;
                return (
                  <tr key={c.id} className={adminTableRowClass}>
                    <td className="px-4 py-3">
                      <div className="text-gray-100 font-medium">{c.name}</div>
                      <div className="text-xs text-gray-400">Criada em {formatCallDateTime(c.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{c.queueLabels.length ? c.queueLabels.join(", ") : "Todas"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          c.status === "active" ? "text-emerald-300" : c.status === "paused" ? "text-amber-300" : "text-gray-400"
                        }
                      >
                        {voiceCampaignStatusLabel[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 min-w-[200px]">
                      <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                        <div className="h-full bg-cyan-400" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1">
                        {finished}/{c.counts.total} finalizados ({pct}%) · {c.counts.done} concluídos ·{" "}
                        {c.counts.exhausted} esgotados · {c.counts.doNotCall} não ligar
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs">
                      <div>{c.counts.readyNow} agora</div>
                      <div className="text-gray-400">
                        {c.counts.retry} em nova tentativa · {c.counts.inCall} em ligação
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                      <div>
                        {c.maxAttempts} tentativas / {c.retryIntervalMinutes} min
                      </div>
                      <div className="text-gray-400">{c.recordCalls ? "Grava ligações" : "Sem gravação"}</div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-3">
                      <button type="button" className={adminBtnLinkClass} onClick={() => setMode({ kind: "import", campaign: c })}>
                        Importar
                      </button>
                      <button type="button" className={adminBtnLinkClass} onClick={() => setMode({ kind: "edit", campaign: c })}>
                        Editar
                      </button>
                      {c.status === "active" ? (
                        <button
                          type="button"
                          className={adminBtnLinkClass}
                          disabled={savingId === c.id}
                          onClick={() => void setStatus(c, "paused")}
                        >
                          Pausar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={adminBtnLinkClass}
                          disabled={savingId === c.id}
                          onClick={() => void setStatus(c, "active")}
                        >
                          Ativar
                        </button>
                      )}
                      {c.status !== "completed" ? (
                        <button
                          type="button"
                          className={adminBtnDangerClass}
                          disabled={savingId === c.id}
                          onClick={() => void setStatus(c, "completed")}
                        >
                          Encerrar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignForm(props: {
  mode: Exclude<Mode, null>;
  queues: Queue[];
  onCancel: () => void;
  onSaved: (message: string) => void;
  setError: (v: string | null) => void;
}) {
  const { mode, queues, onCancel, onSaved, setError } = props;
  const editing = mode.kind === "edit" ? mode.campaign : null;
  const importing = mode.kind === "import" ? mode.campaign : null;
  const needsFile = mode.kind !== "edit";
  const needsSettings = mode.kind !== "import";

  const [name, setName] = useState(editing?.name ?? "");
  const [queueIds, setQueueIds] = useState<string[]>(editing?.queueIds ?? []);
  const [maxAttempts, setMaxAttempts] = useState(editing?.maxAttempts ?? 5);
  const [retryInterval, setRetryInterval] = useState(editing?.retryIntervalMinutes ?? 60);
  const [recordCalls, setRecordCalls] = useState(editing?.recordCalls ?? false);
  const [file, setFile] = useState<{ filename: string; contentBase64: string } | null>(null);
  const [preview, setPreview] = useState<VoiceSpreadsheetPreview | null>(null);
  const [phoneColumn, setPhoneColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const onFile = async (f: File | undefined) => {
    setPreview(null);
    setFile(null);
    if (!f) return;
    setParsing(true);
    setError(null);
    try {
      const contentBase64 = await readFileAsBase64(f);
      const res = await api.post("/admin/telephony/parse-spreadsheet", { filename: f.name, contentBase64 });
      const data = unwrapApiData<VoiceSpreadsheetPreview>(res.data);
      setFile({ filename: f.name, contentBase64 });
      setPreview(data);
      setPhoneColumn(data.suggestedPhoneColumn ?? "");
      setNameColumn(data.suggestedNameColumn ?? "");
      if (!name && mode.kind === "create") setName(f.name.replace(/\.(xlsx|xls|csv)$/i, ""));
    } catch (e) {
      setError(getApiErrorMessage(e, "Não foi possível ler a planilha"));
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (needsSettings && !name.trim()) return setError("Informe o nome da campanha");
    if (needsFile && (!file || !phoneColumn)) return setError("Envie a planilha e selecione a coluna de telefone");
    setSaving(true);
    try {
      if (mode.kind === "create") {
        const res = await api.post("/admin/telephony/campaigns", {
          name,
          queueIds,
          maxAttempts,
          retryIntervalMinutes: retryInterval,
          recordCalls,
          ...file,
          phoneColumn,
          nameColumn: nameColumn || null,
        });
        const data = unwrapApiData<{ campaign: VoiceCampaignSummary; result: VoiceImportResult }>(res.data);
        onSaved(`Campanha "${data.campaign.name}" criada. ${importSummary(data.result)}.`);
      } else if (mode.kind === "import" && importing) {
        const res = await api.post(`/admin/telephony/campaigns/${importing.id}/contacts`, {
          ...file,
          phoneColumn,
          nameColumn: nameColumn || null,
        });
        const data = unwrapApiData<{ campaign: VoiceCampaignSummary; result: VoiceImportResult }>(res.data);
        onSaved(`"${data.campaign.name}": ${importSummary(data.result)}.`);
      } else if (editing) {
        await api.put(`/admin/telephony/campaigns/${editing.id}`, {
          name,
          queueIds,
          maxAttempts,
          retryIntervalMinutes: retryInterval,
          recordCalls,
        });
        onSaved(`Campanha "${name}" atualizada.`);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao salvar campanha"));
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode.kind === "create"
      ? "Nova campanha de voz"
      : mode.kind === "edit"
        ? `Editar "${mode.campaign.name}"`
        : `Importar mais contatos em "${mode.campaign.name}"`;

  return (
    <section className={`${adminSectionClass} space-y-4`}>
      <h2 className="text-lg font-semibold text-white">{title}</h2>

      {needsSettings ? (
        <div className="grid md:grid-cols-2 gap-4">
          <label className={adminLabelClass}>
            Nome da campanha
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={`${adminInputClass} mt-1.5`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={adminLabelClass}>
              Tentativas por contato
              <input
                type="number"
                min={1}
                max={20}
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(Number(e.target.value))}
                className={`${adminInputClass} mt-1.5`}
              />
            </label>
            <label className={adminLabelClass}>
              Intervalo entre tentativas (min)
              <input
                type="number"
                min={5}
                value={retryInterval}
                onChange={(e) => setRetryInterval(Number(e.target.value))}
                className={`${adminInputClass} mt-1.5`}
              />
            </label>
          </div>
          <div className={adminLabelClass}>
            Filas que atendem esta campanha
            <div className="mt-1.5 flex flex-wrap gap-2">
              {queues.length === 0 ? <span className="text-xs text-gray-400">Nenhuma fila cadastrada.</span> : null}
              {queues.map((q) => {
                const checked = queueIds.includes(q.id);
                return (
                  <label
                    key={q.id}
                    className={`px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${
                      checked ? "border-cyan-400 bg-cyan-500/15 text-cyan-100" : "border-zinc-600 text-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        setQueueIds((prev) => (checked ? prev.filter((id) => id !== q.id) : [...prev, q.id]))
                      }
                    />
                    {q.label}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Só atendentes dessas filas veem a campanha no Discador. Sem fila marcada, todos os liberados veem.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" className="mt-1" checked={recordCalls} onChange={(e) => setRecordCalls(e.target.checked)} />
            <span>
              Gravar as ligações desta campanha
              <span className="block text-xs text-gray-500">
                A gravação fica disponível no histórico de ligações. Informe o entrevistado quando exigido (LGPD).
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {needsFile ? (
        <div className="space-y-3">
          <label className={adminLabelClass}>
            Planilha de contatos (.xlsx, .xls ou .csv)
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="mt-1.5 block text-sm text-gray-300"
            />
          </label>
          {parsing ? <p className="text-xs text-gray-400">Lendo planilha…</p> : null}
          {preview ? (
            <>
              <p className="text-xs text-gray-400">{preview.totalRows} linha(s) encontradas.</p>
              <div className="grid md:grid-cols-2 gap-3">
                <label className={adminLabelClass}>
                  Coluna de telefone
                  <select value={phoneColumn} onChange={(e) => setPhoneColumn(e.target.value)} className={`${adminSelectClass} mt-1.5`}>
                    <option value="">Selecione…</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={adminLabelClass}>
                  Coluna de nome (opcional)
                  <select value={nameColumn} onChange={(e) => setNameColumn(e.target.value)} className={`${adminSelectClass} mt-1.5`}>
                    <option value="">Nenhuma</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="overflow-x-auto rounded-lg border border-zinc-700">
                <table className="w-full text-xs">
                  <thead className={adminTableHeadClass}>
                    <tr>
                      {preview.headers.map((h) => (
                        <th
                          key={h}
                          className={`px-3 py-2 whitespace-nowrap ${h === phoneColumn ? "text-cyan-300" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sampleRows.map((row, idx) => (
                      <tr key={idx} className={adminTableRowClass}>
                        {preview.headers.map((h) => (
                          <td key={h} className="px-3 py-1.5 text-gray-300 whitespace-nowrap">
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500">
                Todas as colunas aparecem para o atendente no cartão do contato durante a ligação.
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        <button type="button" className={adminBtnPrimaryClass} disabled={saving || parsing} onClick={() => void submit()}>
          {saving ? "Salvando..." : mode.kind === "create" ? "Criar e importar" : mode.kind === "import" ? "Importar" : "Salvar"}
        </button>
        <button type="button" className={adminBtnSecondaryClass} onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
