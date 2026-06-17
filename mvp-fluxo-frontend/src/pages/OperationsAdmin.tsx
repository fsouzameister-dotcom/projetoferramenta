import { useCallback, useEffect, useMemo, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import InfoTooltip from "~components/InfoTooltip";

type QueueRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  active: boolean;
  agentAiHintsEnabled: boolean;
  businessHours: {
    timezone: string;
    schedule: Record<string, { start: string; end: string }[]>;
  } | null;
  userIds: string[];
};

type TabulacaoRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  active: boolean;
  queueIds: string[];
};

type UserRow = { id: string; name: string; email: string; role_name: string };

type ServiceSettings = {
  closureMessageTemplate: string;
  returnLookupDays: number;
  agentAiHintsEnabled: boolean;
};

const WEEKDAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

const emptySchedule = (): QueueRow["businessHours"] => ({
  timezone: "America/Sao_Paulo",
  schedule: Object.fromEntries(WEEKDAYS.map((d) => [d.key, [{ start: "09:00", end: "18:00" }]])),
});

type TabKey = "queues" | "tabulacoes" | "settings";

export default function OperationsAdmin() {
  const [activeTab, setActiveTab] = useState<TabKey>("queues");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [queues, setQueues] = useState<QueueRow[]>([]);
  const [tabulacoes, setTabulacoes] = useState<TabulacaoRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [settings, setSettings] = useState<ServiceSettings | null>(null);

  const [queueForm, setQueueForm] = useState({
    label: "",
    key: "",
    description: "",
    active: true,
    agentAiHintsEnabled: true,
    userIds: [] as string[],
    hoursEnabled: true,
    schedule: emptySchedule(),
  });
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);

  const [tabForm, setTabForm] = useState({
    label: "",
    key: "",
    description: "",
    active: true,
    queueIds: [] as string[],
  });
  const [editingTabId, setEditingTabId] = useState<string | null>(null);

  const [settingsForm, setSettingsForm] = useState({
    closureMessageTemplate: "",
    returnLookupDays: 7,
    agentAiHintsEnabled: true,
  });

  const queueLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of queues) m.set(q.id, q.label);
    return m;
  }, [queues]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const failures: string[] = [];
    try {
      const [queuesSettled, tabSettled, usersSettled, settingsSettled] = await Promise.allSettled([
        api.get("/queues"),
        api.get("/tabulacoes"),
        api.get("/users"),
        api.get("/service-settings"),
      ]);

      if (queuesSettled.status === "fulfilled") {
        setQueues(unwrapApiData<QueueRow[]>(queuesSettled.value.data));
      } else {
        failures.push(`Filas: ${getApiErrorMessage(queuesSettled.reason, "falha")}`);
      }

      if (tabSettled.status === "fulfilled") {
        setTabulacoes(unwrapApiData<TabulacaoRow[]>(tabSettled.value.data));
      } else {
        failures.push(`Tabulações: ${getApiErrorMessage(tabSettled.reason, "falha")}`);
      }

      if (usersSettled.status === "fulfilled") {
        setUsers(unwrapApiData<UserRow[]>(usersSettled.value.data));
      } else {
        failures.push(`Usuários: ${getApiErrorMessage(usersSettled.reason, "falha")}`);
      }

      if (settingsSettled.status === "fulfilled") {
        const s = unwrapApiData<ServiceSettings & { tenantId: string }>(
          settingsSettled.value.data
        );
        setSettings(s);
        setSettingsForm({
          closureMessageTemplate: s.closureMessageTemplate,
          returnLookupDays: s.returnLookupDays,
          agentAiHintsEnabled: s.agentAiHintsEnabled,
        });
      } else {
        failures.push(`Configurações: ${getApiErrorMessage(settingsSettled.reason, "falha")}`);
      }

      setError(failures.length > 0 ? failures.join(" · ") : null);
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao carregar operação"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const resetQueueForm = () => {
    setEditingQueueId(null);
    setQueueForm({
      label: "",
      key: "",
      description: "",
      active: true,
      agentAiHintsEnabled: true,
      userIds: [],
      hoursEnabled: true,
      schedule: emptySchedule(),
    });
  };

  const resetTabForm = () => {
    setEditingTabId(null);
    setTabForm({ label: "", key: "", description: "", active: true, queueIds: [] });
  };

  const onSaveQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        label: queueForm.label.trim(),
        key: queueForm.key.trim() || undefined,
        description: queueForm.description.trim() || undefined,
        active: queueForm.active,
        agentAiHintsEnabled: queueForm.agentAiHintsEnabled,
        userIds: queueForm.userIds,
        businessHours: queueForm.hoursEnabled ? queueForm.schedule : null,
      };
      if (editingQueueId) {
        await api.put(`/queues/${editingQueueId}`, payload);
        setNotice("Fila atualizada.");
      } else {
        await api.post("/queues", payload);
        setNotice("Fila criada.");
      }
      resetQueueForm();
      await loadAll();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao salvar fila"));
    } finally {
      setSaving(false);
    }
  };

  const onEditQueue = (q: QueueRow) => {
    setEditingQueueId(q.id);
    setQueueForm({
      label: q.label,
      key: q.key,
      description: q.description ?? "",
      active: q.active,
      agentAiHintsEnabled: q.agentAiHintsEnabled !== false,
      userIds: q.userIds ?? [],
      hoursEnabled: Boolean(q.businessHours),
      schedule: q.businessHours ?? emptySchedule(),
    });
  };

  const onDeleteQueue = async (id: string) => {
    if (!window.confirm("Remover esta fila?")) return;
    setSaving(true);
    try {
      await api.delete(`/queues/${id}`);
      setNotice("Fila removida.");
      await loadAll();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao remover fila"));
    } finally {
      setSaving(false);
    }
  };

  const onSaveTab = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        label: tabForm.label.trim(),
        key: tabForm.key.trim() || undefined,
        description: tabForm.description.trim() || undefined,
        active: tabForm.active,
        queueIds: tabForm.queueIds,
      };
      if (editingTabId) {
        await api.put(`/tabulacoes/${editingTabId}`, payload);
        setNotice("Tabulação atualizada.");
      } else {
        await api.post("/tabulacoes", payload);
        setNotice("Tabulação criada.");
      }
      resetTabForm();
      await loadAll();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao salvar tabulação"));
    } finally {
      setSaving(false);
    }
  };

  const onEditTab = (t: TabulacaoRow) => {
    setEditingTabId(t.id);
    setTabForm({
      label: t.label,
      key: t.key,
      description: t.description ?? "",
      active: t.active,
      queueIds: t.queueIds ?? [],
    });
  };

  const onDeleteTab = async (id: string) => {
    if (!window.confirm("Remover esta tabulação?")) return;
    setSaving(true);
    try {
      await api.delete(`/tabulacoes/${id}`);
      setNotice("Tabulação removida.");
      await loadAll();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao remover tabulação"));
    } finally {
      setSaving(false);
    }
  };

  const onSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.put("/service-settings", settingsForm);
      setNotice("Configurações salvas.");
      await loadAll();
    } catch (err) {
      setError(getApiErrorMessage(err, "Erro ao salvar configurações"));
    } finally {
      setSaving(false);
    }
  };

  const toggleQueueUser = (userId: string) => {
    setQueueForm((prev) => ({
      ...prev,
      userIds: prev.userIds.includes(userId)
        ? prev.userIds.filter((id) => id !== userId)
        : [...prev.userIds, userId],
    }));
  };

  const toggleTabQueue = (queueId: string) => {
    setTabForm((prev) => ({
      ...prev,
      queueIds: prev.queueIds.includes(queueId)
        ? prev.queueIds.filter((id) => id !== queueId)
        : [...prev.queueIds, queueId],
    }));
  };

  const updateDaySlot = (day: string, field: "start" | "end", value: string) => {
    setQueueForm((prev) => {
      const schedule = { ...prev.schedule!.schedule };
      const slots = [...(schedule[day] ?? [{ start: "09:00", end: "18:00" }])];
      slots[0] = { ...slots[0], [field]: value };
      schedule[day] = slots;
      return { ...prev, schedule: { ...prev.schedule!, schedule } };
    });
  };

  const inputClass =
    "mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white";
  const cardClass =
    "rounded-xl border border-gray-100 bg-white p-5 space-y-4 shadow-sm text-gray-900";

  return (
    <div className="p-8 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Operação</h1>
        <p className="text-sm text-gray-300 mt-1">
          Filas, tabulações de encerramento e mensagens automáticas ao cliente.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}

      <div className="flex gap-2 border-b border-gray-600/60">
        {(
          [
            ["queues", "Filas"],
            ["tabulacoes", "Tabulações"],
            ["settings", "Configurações"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === key
                ? "border-cyan-400 text-cyan-200"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-gray-400">Carregando…</p> : null}

      {activeTab === "queues" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={onSaveQueue} className={cardClass}>
            <h2 className="font-semibold text-gray-900">
              {editingQueueId ? "Editar fila" : "Nova fila"}
            </h2>
            <label className="block text-sm text-gray-800">
              <span className="text-gray-700">Nome</span>
              <input
                className={inputClass}
                value={queueForm.label}
                onChange={(e) => setQueueForm((p) => ({ ...p, label: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm text-gray-800">
              <span className="text-gray-700">Chave (opcional)</span>
              <input
                className={inputClass}
                value={queueForm.key}
                onChange={(e) => setQueueForm((p) => ({ ...p, key: e.target.value }))}
                placeholder="ex.: suporte"
              />
            </label>
            <label className="block text-sm text-gray-800">
              <span className="text-gray-700">Descrição</span>
              <input
                className={inputClass}
                value={queueForm.description}
                onChange={(e) => setQueueForm((p) => ({ ...p, description: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={queueForm.active}
                onChange={(e) => setQueueForm((p) => ({ ...p, active: e.target.checked }))}
              />
              Fila ativa
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                className="mt-1"
                checked={queueForm.agentAiHintsEnabled}
                onChange={(e) =>
                  setQueueForm((p) => ({ ...p, agentAiHintsEnabled: e.target.checked }))
                }
              />
              <span>
                <span className="text-gray-700 flex items-center gap-1">
                  Dicas de IA nesta fila
                  <InfoTooltip text="Só vale se o interruptor geral em Configurações estiver ativo. Desative para filas em que os agentes não devem receber sugestões." />
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={queueForm.hoursEnabled}
                onChange={(e) => setQueueForm((p) => ({ ...p, hoursEnabled: e.target.checked }))}
              />
              Horário de atendimento
              <InfoTooltip text="Usado para relatórios e regras futuras de roteamento fora do expediente." />
            </label>
            {queueForm.hoursEnabled ? (
              <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                {WEEKDAYS.map((day) => (
                  <div key={day.key} className="flex items-center gap-2 text-sm text-gray-800">
                    <span className="w-16 text-gray-600">{day.label}</span>
                    <input
                      type="time"
                      className="border border-gray-300 rounded px-2 py-1 text-gray-900 bg-white"
                      value={queueForm.schedule?.schedule[day.key]?.[0]?.start ?? "09:00"}
                      onChange={(e) => updateDaySlot(day.key, "start", e.target.value)}
                    />
                    <span className="text-gray-600">—</span>
                    <input
                      type="time"
                      className="border border-gray-300 rounded px-2 py-1 text-gray-900 bg-white"
                      value={queueForm.schedule?.schedule[day.key]?.[0]?.end ?? "18:00"}
                      onChange={(e) => updateDaySlot(day.key, "end", e.target.value)}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Agentes com acesso à fila
              </p>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={queueForm.userIds.includes(u.id)}
                      onChange={() => toggleQueueUser(u.id)}
                    />
                    {u.name} ({u.role_name})
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar fila"}
              </button>
              {editingQueueId ? (
                <button type="button" className="text-sm text-gray-600" onClick={resetQueueForm}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden text-gray-900">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Fila</th>
                  <th className="text-left px-4 py-2">Chave</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => (
                  <tr key={q.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-900">
                      {q.label}
                      {!q.active ? (
                        <span className="ml-2 text-xs text-amber-600">inativa</span>
                      ) : null}
                      {q.agentAiHintsEnabled === false ? (
                        <span className="ml-2 text-xs text-gray-500">sem dicas IA</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{q.key}</td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <button type="button" className="text-cyan-700" onClick={() => onEditQueue(q)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-red-600"
                        onClick={() => void onDeleteQueue(q.id)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "tabulacoes" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={onSaveTab} className={cardClass}>
            <h2 className="font-semibold text-gray-900">
              {editingTabId ? "Editar tabulação" : "Nova tabulação"}
            </h2>
            <p className="text-xs text-gray-500">
              Sem filas vinculadas = disponível em todas. Com filas = só atendimentos dessas filas.
            </p>
            <label className="block text-sm text-gray-800">
              <span className="text-gray-700">Rótulo</span>
              <input
                className={inputClass}
                value={tabForm.label}
                onChange={(e) => setTabForm((p) => ({ ...p, label: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm text-gray-800">
              <span className="text-gray-700">Chave (opcional)</span>
              <input
                className={inputClass}
                value={tabForm.key}
                onChange={(e) => setTabForm((p) => ({ ...p, key: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-gray-800">
              <span className="text-gray-700">Descrição</span>
              <input
                className={inputClass}
                value={tabForm.description}
                onChange={(e) => setTabForm((p) => ({ ...p, description: e.target.value }))}
              />
            </label>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Filas</p>
              <div className="border border-gray-200 rounded-lg p-2 space-y-1 max-h-36 overflow-y-auto">
                {queues.map((q) => (
                  <label key={q.id} className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={tabForm.queueIds.includes(q.id)}
                      onChange={() => toggleTabQueue(q.id)}
                    />
                    {q.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar tabulação"}
              </button>
              {editingTabId ? (
                <button type="button" className="text-sm text-gray-600" onClick={resetTabForm}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden text-gray-900">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Tabulação</th>
                  <th className="text-left px-4 py-2">Filas</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {tabulacoes.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-900">{t.label}</td>
                    <td className="px-4 py-2 text-gray-600 text-xs">
                      {!t.queueIds?.length
                        ? "Todas"
                        : t.queueIds.map((id) => queueLabelById.get(id) ?? id).join(", ")}
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <button type="button" className="text-cyan-700" onClick={() => onEditTab(t)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-red-600"
                        onClick={() => void onDeleteTab(t.id)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <form onSubmit={onSaveSettings} className={`${cardClass} max-w-2xl`}>
          <h2 className="font-semibold text-gray-900">Encerramento e retorno</h2>
          <label className="block text-sm text-gray-800">
            <span className="text-gray-700 flex items-center gap-1">
              Mensagem de encerramento
              <InfoTooltip text="Placeholders: {{protocolo}}, {{nome_cliente}}, {{resumo_tabulacao}}, {{data}}. Enviada na janela 24h; fora dela fica registrado nos relatórios." />
            </span>
            <textarea
              className={`${inputClass} min-h-[120px]`}
              value={settingsForm.closureMessageTemplate}
              onChange={(e) =>
                setSettingsForm((p) => ({ ...p, closureMessageTemplate: e.target.value }))
              }
              required
            />
          </label>
          <label className="block text-sm text-gray-800">
            <span className="text-gray-700">Dias para oferecer “continuar atendimento”</span>
            <input
              type="number"
              min={1}
              max={365}
              className="mt-1 w-32 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white"
              value={settingsForm.returnLookupDays}
              onChange={(e) =>
                setSettingsForm((p) => ({
                  ...p,
                  returnLookupDays: Number(e.target.value) || 7,
                }))
              }
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              className="mt-1"
              checked={settingsForm.agentAiHintsEnabled}
              onChange={(e) =>
                setSettingsForm((p) => ({ ...p, agentAiHintsEnabled: e.target.checked }))
              }
            />
            <span>
              <span className="text-gray-700 flex items-center gap-1">
                Dicas de IA para agentes
                <InfoTooltip text="Interruptor geral do tenant. Quando desligado, nenhuma fila exibe dicas. Quando ligado, cada fila pode desativar individualmente na aba Filas." />
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Desative se a equipe preferir atender sem sugestões automáticas da IA.
              </span>
            </span>
          </label>
          {settings ? (
            <p className="text-xs text-gray-500">Última atualização: {settings.closureMessageTemplate ? "ok" : "—"}</p>
          ) : null}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar configurações"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
