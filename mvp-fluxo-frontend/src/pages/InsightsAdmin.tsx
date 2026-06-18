import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import { hasPermission } from "../lib/permissions";

type InsightTemplate = {
  id: string;
  name: string;
  description?: string | null;
  systemPrompt: string;
  isDefault: boolean;
  isActive: boolean;
};

type InsightJobSummary = {
  jobId: string;
  status: "queued" | "running" | "done" | "failed";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  templateId: string | null;
};

type InsightJobDetail = InsightJobSummary & {
  filters: {
    dateFrom: string;
    dateTo: string;
  };
  promptOverride: string | null;
  errorMessage: string | null;
  result: {
    summary: string;
    highlights: string[];
    risks: string[];
    opportunities: string[];
    metrics: Record<string, unknown>;
  } | null;
};

type QueueOption = { id: string; name: string; key: string };

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function statusLabel(status: InsightJobSummary["status"]): string {
  switch (status) {
    case "queued":
      return "Na fila";
    case "running":
      return "Processando";
    case "done":
      return "Concluído";
    case "failed":
      return "Falhou";
    default:
      return status;
  }
}

export default function InsightsAdmin() {
  const canManageTemplates = hasPermission("ai");
  const [templates, setTemplates] = useState<InsightTemplate[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [jobs, setJobs] = useState<InsightJobSummary[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<InsightJobDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const [runForm, setRunForm] = useState({
    dateFrom: daysAgoIsoDate(7),
    dateTo: todayIsoDate(),
    templateId: "",
    promptOverride: "",
    queueId: "",
    includeVoiceTranscripts: false,
  });

  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    systemPrompt:
      "Foque em qualidade de atendimento, padrões de objeção e oportunidades de melhoria operacional.",
    isDefault: false,
  });

  const pollingJob = useMemo(
    () => jobs.find((j) => j.status === "queued" || j.status === "running"),
    [jobs]
  );

  const loadJobs = async () => {
    const res = await api.get("/ai/insights", { params: { limit: 20 } });
    setJobs(unwrapApiData<InsightJobSummary[]>(res.data));
  };

  const loadTemplates = async () => {
    if (!canManageTemplates) return;
    const res = await api.get("/ai/insight-templates");
    setTemplates(unwrapApiData<InsightTemplate[]>(res.data));
  };

  const loadQueues = async () => {
    try {
      const res = await api.get("/queues");
      const rows = unwrapApiData<Array<{ id: string; name: string; key: string }>>(res.data);
      setQueues(rows);
    } catch {
      setQueues([]);
    }
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      await Promise.all([loadJobs(), loadTemplates(), loadQueues()]);
    } catch (error) {
      setNotice(getApiErrorMessage(error, "Falha ao carregar insights"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJob(null);
      return;
    }
    const fetchJob = async () => {
      try {
        const res = await api.get(`/ai/insights/${selectedJobId}`);
        setSelectedJob(unwrapApiData<InsightJobDetail>(res.data));
      } catch (error) {
        setNotice(getApiErrorMessage(error, "Falha ao carregar job"));
      }
    };
    void fetchJob();
  }, [selectedJobId]);

  useEffect(() => {
    if (!pollingJob && !selectedJobId) return;
    const id = setInterval(() => {
      void loadJobs();
      if (selectedJobId) {
        void api
          .get(`/ai/insights/${selectedJobId}`)
          .then((res) => setSelectedJob(unwrapApiData<InsightJobDetail>(res.data)))
          .catch(() => undefined);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [pollingJob, selectedJobId]);

  const submitRun = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setRunning(true);
      setNotice(null);
      const body: Record<string, unknown> = {
        dateFrom: runForm.dateFrom,
        dateTo: runForm.dateTo,
        includeVoiceTranscripts: runForm.includeVoiceTranscripts,
      };
      if (runForm.templateId) body.templateId = runForm.templateId;
      if (runForm.promptOverride.trim()) body.promptOverride = runForm.promptOverride.trim();
      if (runForm.queueId) body.queueIds = [runForm.queueId];

      const res = await api.post("/ai/insights/run", body);
      const created = unwrapApiData<InsightJobSummary>(res.data);
      setSelectedJobId(created.jobId);
      setNotice("Análise enfileirada. O resultado aparecerá em instantes.");
      await loadJobs();
    } catch (error) {
      setNotice(getApiErrorMessage(error, "Falha ao disparar análise"));
    } finally {
      setRunning(false);
    }
  };

  const submitTemplate = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManageTemplates) return;
    try {
      await api.post("/ai/insight-templates", {
        name: templateForm.name,
        description: templateForm.description || undefined,
        systemPrompt: templateForm.systemPrompt,
        isDefault: templateForm.isDefault,
      });
      setTemplateForm({
        name: "",
        description: "",
        systemPrompt: templateForm.systemPrompt,
        isDefault: false,
      });
      setNotice("Template salvo.");
      await loadTemplates();
    } catch (error) {
      setNotice(getApiErrorMessage(error, "Falha ao salvar template"));
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-100">Insights com IA</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Análises sob demanda sobre conversas do período, com resumo executivo e recomendações.
        </p>
      </header>

      {notice && (
        <div className="rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-4 py-3 text-sm text-cyan-100">
          {notice}
        </div>
      )}

      <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-100">Nova análise</h2>
        <form onSubmit={submitRun} className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-zinc-300">
            De
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2"
              value={runForm.dateFrom}
              onChange={(e) => setRunForm((p) => ({ ...p, dateFrom: e.target.value }))}
              required
            />
          </label>
          <label className="text-sm text-zinc-300">
            Até
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2"
              value={runForm.dateTo}
              onChange={(e) => setRunForm((p) => ({ ...p, dateTo: e.target.value }))}
              required
            />
          </label>
          {templates.length > 0 && (
            <label className="text-sm text-zinc-300 md:col-span-2">
              Template
              <select
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2"
                value={runForm.templateId}
                onChange={(e) => setRunForm((p) => ({ ...p, templateId: e.target.value }))}
              >
                <option value="">Padrão do tenant (se houver)</option>
                {templates
                  .filter((t) => t.isActive)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.isDefault ? " (padrão)" : ""}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {queues.length > 0 && (
            <label className="text-sm text-zinc-300 md:col-span-2">
              Fila (opcional)
              <select
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2"
                value={runForm.queueId}
                onChange={(e) => setRunForm((p) => ({ ...p, queueId: e.target.value }))}
              >
                <option value="">Todas as filas</option>
                {queues.map((q) => (
                  <option key={q.id} value={q.key}>
                    {q.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm text-zinc-300 md:col-span-2">
            Instruções adicionais (opcional)
            <textarea
              className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 min-h-[80px]"
              value={runForm.promptOverride}
              onChange={(e) => setRunForm((p) => ({ ...p, promptOverride: e.target.value }))}
              placeholder="Ex.: priorize reclamações sobre prazo de entrega"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300 md:col-span-2">
            <input
              type="checkbox"
              checked={runForm.includeVoiceTranscripts}
              onChange={(e) =>
                setRunForm((p) => ({ ...p, includeVoiceTranscripts: e.target.checked }))
              }
            />
            Incluir transcrições de áudio quando disponíveis
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={running || loading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {running ? "Enfileirando..." : "Gerar insights"}
            </button>
          </div>
        </form>
      </section>

      {canManageTemplates && (
        <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-4">
          <h2 className="text-lg font-semibold text-zinc-100">Templates de insight</h2>
          <form onSubmit={submitTemplate} className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-zinc-300">
              Nome
              <input
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2"
                value={templateForm.name}
                onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </label>
            <label className="text-sm text-zinc-300">
              Descrição
              <input
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2"
                value={templateForm.description}
                onChange={(e) => setTemplateForm((p) => ({ ...p, description: e.target.value }))}
              />
            </label>
            <label className="text-sm text-zinc-300 md:col-span-2">
              Prompt do template
              <textarea
                className="mt-1 w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 min-h-[100px]"
                value={templateForm.systemPrompt}
                onChange={(e) => setTemplateForm((p) => ({ ...p, systemPrompt: e.target.value }))}
                required
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={templateForm.isDefault}
                onChange={(e) => setTemplateForm((p) => ({ ...p, isDefault: e.target.checked }))}
              />
              Definir como template padrão
            </label>
            <div>
              <button
                type="submit"
                className="rounded-lg border border-zinc-500 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
              >
                Salvar template
              </button>
            </div>
          </form>
          {templates.length > 0 && (
            <ul className="divide-y divide-zinc-700 text-sm">
              {templates.map((t) => (
                <li key={t.id} className="py-2 flex justify-between gap-4 text-zinc-300">
                  <span>
                    {t.name}
                    {t.isDefault ? " · padrão" : ""}
                    {!t.isActive ? " · inativo" : ""}
                  </span>
                  <span className="text-zinc-500 truncate max-w-md">{t.description}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-zinc-100">Histórico</h2>
        {loading && jobs.length === 0 ? (
          <p className="text-sm text-zinc-400">Carregando...</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-zinc-400">Nenhuma análise executada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-zinc-300">
              <thead className="text-zinc-500 border-b border-zinc-700">
                <tr>
                  <th className="py-2 pr-4">Data</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.jobId} className="border-b border-zinc-800">
                    <td className="py-2 pr-4">
                      {new Date(job.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 pr-4">{statusLabel(job.status)}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="text-accent hover:underline"
                        onClick={() => setSelectedJobId(job.jobId)}
                      >
                        Ver resultado
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedJob && (
        <section className="rounded-xl border border-zinc-600 bg-zinc-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-100">Resultado da análise</h2>
            <span className="text-sm text-zinc-400">{statusLabel(selectedJob.status)}</span>
          </div>

          {selectedJob.errorMessage && (
            <p className="text-sm text-red-300">{selectedJob.errorMessage}</p>
          )}

          {selectedJob.result ? (
            <div className="space-y-4 text-sm text-zinc-200">
              <div>
                <h3 className="font-semibold text-zinc-100 mb-1">Resumo</h3>
                <p className="whitespace-pre-wrap">{selectedJob.result.summary}</p>
              </div>
              {selectedJob.result.highlights.length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-100 mb-1">Destaques</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    {selectedJob.result.highlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedJob.result.risks.length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-100 mb-1">Riscos</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    {selectedJob.result.risks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedJob.result.opportunities.length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-100 mb-1">Oportunidades</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    {selectedJob.result.opportunities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Object.keys(selectedJob.result.metrics).length > 0 && (
                <div>
                  <h3 className="font-semibold text-zinc-100 mb-1">Métricas</h3>
                  <pre className="rounded-lg bg-zinc-950 p-3 text-xs overflow-x-auto">
                    {JSON.stringify(selectedJob.result.metrics, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : selectedJob.status === "queued" || selectedJob.status === "running" ? (
            <p className="text-sm text-zinc-400">Processando análise...</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
