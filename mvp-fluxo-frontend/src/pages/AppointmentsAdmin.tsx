import { useCallback, useEffect, useMemo, useState } from "react";
import api, { getApiErrorMessage, unwrapApiData } from "../api/client";
import InfoTooltip from "~components/InfoTooltip";

type CapacityMode = "pool" | "resource";

type AppointmentService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  capacityMode: CapacityMode;
  poolCapacity: number;
  timezone: string;
  active: boolean;
};

type AppointmentResource = {
  id: string;
  serviceId: string;
  name: string;
  active: boolean;
};

type AvailabilityRule = {
  id: string;
  serviceId: string;
  resourceId: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
};

type AppointmentBlock = {
  id: string;
  serviceId: string | null;
  resourceId: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

type AvailableSlot = {
  start: string;
  end: string;
  resourceId: string | null;
  resourceName?: string;
};

type AppointmentItem = {
  id: string;
  serviceId: string;
  serviceName?: string;
  resourceId: string | null;
  resourceName?: string | null;
  clientName: string | null;
  phoneE164: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
};

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const statusLabel: Record<string, string> = {
  booked: "Agendado",
  cancelled: "Cancelado",
  completed: "Concluído",
  no_show: "Não compareceu",
};

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AppointmentsAdmin() {
  const [activeTab, setActiveTab] = useState<"config" | "agenda">("agenda");
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadServices = useCallback(async () => {
    try {
      const res = await api.get("/admin/appointments/services");
      setServices(unwrapApiData<AppointmentService[]>(res.data));
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao carregar serviços"));
    }
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  return (
    <div className="p-6 max-w-6xl mx-auto text-gray-100">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-2xl font-semibold text-white">Agendamentos</h1>
        <InfoTooltip text="Serviços agendáveis (exames, visitas, pesquisas...), expediente/recursos e a agenda de horários marcados." />
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Configure o que pode ser agendado e o expediente disponível; acompanhe e gerencie os horários marcados
        (inclusive os feitos pelo bot).
      </p>

      <div className="flex gap-2 mb-6 border-b border-zinc-700">
        {(
          [
            { id: "agenda", label: "Agenda" },
            { id: "config", label: "Configuração" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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

      {activeTab === "config" ? (
        <ConfigTab
          services={services}
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          setNotice={setNotice}
          reloadServices={loadServices}
        />
      ) : (
        <AgendaTab
          services={services}
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          setNotice={setNotice}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba Configuração
// ---------------------------------------------------------------------------

function ConfigTab(props: {
  services: AppointmentService[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
  reloadServices: () => Promise<void>;
}) {
  const { services, saving, setSaving, setError, setNotice, reloadServices } = props;
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [capacityMode, setCapacityMode] = useState<CapacityMode>("pool");
  const [poolCapacity, setPoolCapacity] = useState(1);

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId]
  );

  const createService = async () => {
    if (!name.trim() || !durationMinutes) {
      setError("Informe nome e duração do serviço.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/admin/appointments/services", {
        name,
        description,
        durationMinutes,
        capacityMode,
        poolCapacity,
      });
      setNotice(`Serviço "${name}" criado.`);
      setName("");
      setDescription("");
      setDurationMinutes(30);
      setCapacityMode("pool");
      setPoolCapacity(1);
      await reloadServices();
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao criar serviço"));
    } finally {
      setSaving(false);
    }
  };

  const toggleServiceActive = async (service: AppointmentService) => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/admin/appointments/services/${service.id}`, { active: !service.active });
      await reloadServices();
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao atualizar serviço"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5">
        <h2 className="text-lg font-medium text-white mb-4">Novo serviço agendável</h2>
        <p className="text-xs text-gray-500 mb-4">
          Ex.: "Exame de sangue", "Visita ao imóvel", "Pesquisa domiciliar". Cada serviço tem duração fixa e pode
          funcionar com vagas simultâneas (pool) ou exigir um recurso específico (profissional, sala, imóvel...).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="text-gray-400 mb-1 block">Nome</span>
            <input
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-400 mb-1 block">Duração (minutos)</span>
            <input
              type="number"
              min={5}
              step={5}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-gray-400 mb-1 block">Descrição (opcional)</span>
            <input
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-400 mb-1 block">Modo de capacidade</span>
            <select
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
              value={capacityMode}
              onChange={(e) => setCapacityMode(e.target.value as CapacityMode)}
            >
              <option value="pool">Vagas simultâneas (sem recurso nomeado)</option>
              <option value="resource">Recurso específico (profissional, sala, imóvel...)</option>
            </select>
          </label>
          {capacityMode === "pool" ? (
            <label className="block text-sm">
              <span className="text-gray-400 mb-1 block">Vagas simultâneas por horário</span>
              <input
                type="number"
                min={1}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2"
                value={poolCapacity}
                onChange={(e) => setPoolCapacity(Number(e.target.value) || 1)}
              />
            </label>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={() => void createService()}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            {saving ? "Salvando…" : "Criar serviço"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5">
        <h2 className="text-lg font-medium text-white mb-4">Serviços cadastrados</h2>
        {services.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum serviço cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-zinc-700">
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Duração</th>
                  <th className="py-2 pr-3">Modo</th>
                  <th className="py-2 pr-3">Ativo</th>
                  <th className="py-2 pr-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-800">
                    <td className="py-2 pr-3">{s.name}</td>
                    <td className="py-2 pr-3">{s.durationMinutes} min</td>
                    <td className="py-2 pr-3">
                      {s.capacityMode === "pool" ? `Pool (${s.poolCapacity} vagas)` : "Recurso específico"}
                    </td>
                    <td className="py-2 pr-3">{s.active ? "Sim" : "Não"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          className="text-cyan-400 hover:underline"
                          onClick={() => setSelectedServiceId(s.id === selectedServiceId ? null : s.id)}
                        >
                          {selectedServiceId === s.id ? "Fechar" : "Configurar"}
                        </button>
                        <button
                          type="button"
                          className="text-amber-400 hover:underline"
                          disabled={saving}
                          onClick={() => void toggleServiceActive(s)}
                        >
                          {s.active ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedService ? (
        <ServiceDetailPanel
          service={selectedService}
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          setNotice={setNotice}
        />
      ) : null}
    </div>
  );
}

function ServiceDetailPanel(props: {
  service: AppointmentService;
  saving: boolean;
  setSaving: (v: boolean) => void;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const { service, saving, setSaving, setError, setNotice } = props;
  const [resources, setResources] = useState<AppointmentResource[]>([]);
  const [newResourceName, setNewResourceName] = useState("");
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [blocks, setBlocks] = useState<AppointmentBlock[]>([]);
  const [ruleOwner, setRuleOwner] = useState<string>("__default__");
  const [weekdayRules, setWeekdayRules] = useState<
    Record<number, { active: boolean; startTime: string; endTime: string }>
  >(
    Object.fromEntries(
      WEEKDAYS.map((_, idx) => [idx, { active: false, startTime: "09:00", endTime: "18:00" }])
    )
  );
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const loadResources = useCallback(async () => {
    if (service.capacityMode !== "resource") return;
    try {
      const res = await api.get(`/admin/appointments/services/${service.id}/resources`);
      setResources(unwrapApiData<AppointmentResource[]>(res.data));
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao carregar recursos"));
    }
  }, [service.id, service.capacityMode, setError]);

  const loadRules = useCallback(async () => {
    try {
      const res = await api.get(`/admin/appointments/services/${service.id}/availability-rules`);
      setRules(unwrapApiData<AvailabilityRule[]>(res.data));
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao carregar expediente"));
    }
  }, [service.id, setError]);

  const loadBlocks = useCallback(async () => {
    try {
      const res = await api.get(`/admin/appointments/services/${service.id}/blocks`);
      setBlocks(unwrapApiData<AppointmentBlock[]>(res.data));
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao carregar bloqueios"));
    }
  }, [service.id, setError]);

  useEffect(() => {
    void loadResources();
    void loadRules();
    void loadBlocks();
    setRuleOwner("__default__");
  }, [loadResources, loadRules, loadBlocks]);

  useEffect(() => {
    const ownerId = ruleOwner === "__default__" ? null : ruleOwner;
    const relevant = rules.filter((r) => r.resourceId === ownerId);
    const next = Object.fromEntries(
      WEEKDAYS.map((_, idx) => {
        const found = relevant.find((r) => r.weekday === idx);
        return [
          idx,
          found
            ? { active: true, startTime: found.startTime, endTime: found.endTime }
            : { active: false, startTime: "09:00", endTime: "18:00" },
        ];
      })
    );
    setWeekdayRules(next);
  }, [rules, ruleOwner]);

  const addResource = async () => {
    if (!newResourceName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/appointments/services/${service.id}/resources`, { name: newResourceName });
      setNewResourceName("");
      await loadResources();
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao adicionar recurso"));
    } finally {
      setSaving(false);
    }
  };

  const toggleResourceActive = async (resource: AppointmentResource) => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/admin/appointments/resources/${resource.id}`, { active: !resource.active });
      await loadResources();
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao atualizar recurso"));
    } finally {
      setSaving(false);
    }
  };

  const saveWeekdayRules = async () => {
    setSaving(true);
    setError(null);
    try {
      const payloadRules = Object.entries(weekdayRules)
        .filter(([, v]) => v.active)
        .map(([weekday, v]) => ({ weekday: Number(weekday), startTime: v.startTime, endTime: v.endTime }));
      await api.put(`/admin/appointments/services/${service.id}/availability-rules`, {
        resourceId: ruleOwner === "__default__" ? null : ruleOwner,
        rules: payloadRules,
      });
      setNotice("Expediente salvo.");
      await loadRules();
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao salvar expediente"));
    } finally {
      setSaving(false);
    }
  };

  const addBlock = async () => {
    if (!blockStart || !blockEnd) {
      setError("Informe início e fim do bloqueio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/appointments/services/${service.id}/blocks`, {
        startsAt: new Date(blockStart).toISOString(),
        endsAt: new Date(blockEnd).toISOString(),
        reason: blockReason,
      });
      setBlockStart("");
      setBlockEnd("");
      setBlockReason("");
      await loadBlocks();
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao criar bloqueio"));
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async (blockId: string) => {
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/admin/appointments/blocks/${blockId}`);
      await loadBlocks();
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao remover bloqueio"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-cyan-700/40 bg-zinc-900/80 p-5 space-y-6">
      <h2 className="text-lg font-medium text-white">Configurar: {service.name}</h2>

      {service.capacityMode === "resource" ? (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">Recursos (profissional, sala, imóvel...)</h3>
          <div className="flex gap-2 mb-3">
            <input
              className="flex-1 rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm"
              placeholder="Nome do recurso"
              value={newResourceName}
              onChange={(e) => setNewResourceName(e.target.value)}
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void addResource()}
              className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm"
            >
              Adicionar
            </button>
          </div>
          <ul className="space-y-1">
            {resources.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm bg-zinc-800/60 rounded-lg px-3 py-2">
                <span>
                  {r.name} {!r.active ? <span className="text-gray-500">(inativo)</span> : null}
                </span>
                <button
                  type="button"
                  className="text-amber-400 hover:underline text-xs"
                  disabled={saving}
                  onClick={() => void toggleResourceActive(r)}
                >
                  {r.active ? "Desativar" : "Ativar"}
                </button>
              </li>
            ))}
            {resources.length === 0 ? <p className="text-xs text-gray-500">Nenhum recurso cadastrado.</p> : null}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-2">Expediente (horários disponíveis)</h3>
        {service.capacityMode === "resource" && resources.length > 0 ? (
          <label className="block text-xs mb-3">
            <span className="text-gray-400 mb-1 block">Aplicar a</span>
            <select
              className="w-full md:w-72 rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm"
              value={ruleOwner}
              onChange={(e) => setRuleOwner(e.target.value)}
            >
              <option value="__default__">Padrão (recursos sem expediente próprio)</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="space-y-2">
          {WEEKDAYS.map((label, idx) => (
            <div key={idx} className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2 w-32">
                <input
                  type="checkbox"
                  checked={weekdayRules[idx]?.active ?? false}
                  onChange={(e) =>
                    setWeekdayRules((prev) => ({
                      ...prev,
                      [idx]: { ...prev[idx], active: e.target.checked },
                    }))
                  }
                />
                {label}
              </label>
              <input
                type="time"
                disabled={!weekdayRules[idx]?.active}
                className="rounded-lg bg-zinc-800 border border-zinc-600 px-2 py-1 text-sm disabled:opacity-40"
                value={weekdayRules[idx]?.startTime ?? "09:00"}
                onChange={(e) =>
                  setWeekdayRules((prev) => ({
                    ...prev,
                    [idx]: { ...prev[idx], startTime: e.target.value },
                  }))
                }
              />
              <span className="text-gray-500">até</span>
              <input
                type="time"
                disabled={!weekdayRules[idx]?.active}
                className="rounded-lg bg-zinc-800 border border-zinc-600 px-2 py-1 text-sm disabled:opacity-40"
                value={weekdayRules[idx]?.endTime ?? "18:00"}
                onChange={(e) =>
                  setWeekdayRules((prev) => ({
                    ...prev,
                    [idx]: { ...prev[idx], endTime: e.target.value },
                  }))
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveWeekdayRules()}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            Salvar expediente
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-2">Bloqueios pontuais (feriado, manutenção...)</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
          <input
            type="datetime-local"
            className="rounded-lg bg-zinc-800 border border-zinc-600 px-2 py-2 text-sm"
            value={blockStart}
            onChange={(e) => setBlockStart(e.target.value)}
          />
          <input
            type="datetime-local"
            className="rounded-lg bg-zinc-800 border border-zinc-600 px-2 py-2 text-sm"
            value={blockEnd}
            onChange={(e) => setBlockEnd(e.target.value)}
          />
          <input
            className="rounded-lg bg-zinc-800 border border-zinc-600 px-2 py-2 text-sm"
            placeholder="Motivo (opcional)"
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void addBlock()}
            className="px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white text-sm"
          >
            Bloquear
          </button>
        </div>
        <ul className="space-y-1">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between text-sm bg-zinc-800/60 rounded-lg px-3 py-2">
              <span>
                {fmtDateTime(b.startsAt)} → {fmtDateTime(b.endsAt)} {b.reason ? `— ${b.reason}` : ""}
              </span>
              <button
                type="button"
                className="text-red-400 hover:underline text-xs"
                disabled={saving}
                onClick={() => void removeBlock(b.id)}
              >
                Remover
              </button>
            </li>
          ))}
          {blocks.length === 0 ? <p className="text-xs text-gray-500">Nenhum bloqueio cadastrado.</p> : null}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Aba Agenda
// ---------------------------------------------------------------------------

function AgendaTab(props: {
  services: AppointmentService[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  setError: (v: string | null) => void;
  setNotice: (v: string | null) => void;
}) {
  const { services, saving, setSaving, setError, setNotice } = props;
  const [filterServiceId, setFilterServiceId] = useState("");
  const [filterStatus, setFilterStatus] = useState("booked");
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentItem | null>(null);

  const loadAppointments = useCallback(async () => {
    try {
      const res = await api.get("/admin/appointments", {
        params: {
          serviceId: filterServiceId || undefined,
          status: filterStatus || undefined,
        },
      });
      setAppointments(unwrapApiData<AppointmentItem[]>(res.data));
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao carregar agendamentos"));
    }
  }, [filterServiceId, filterStatus, setError]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const runAction = async (appointmentId: string, action: "cancel" | "complete", body?: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/appointments/${appointmentId}/${action}`, body ?? {});
      setNotice("Agendamento atualizado.");
      await loadAppointments();
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao atualizar agendamento"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap gap-3">
            <label className="block text-sm">
              <span className="text-gray-400 mb-1 block">Serviço</span>
              <select
                className="rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm"
                value={filterServiceId}
                onChange={(e) => setFilterServiceId(e.target.value)}
              >
                <option value="">Todos</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-gray-400 mb-1 block">Status</span>
              <select
                className="rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="booked">Agendado</option>
                <option value="completed">Concluído</option>
                <option value="cancelled">Cancelado</option>
                <option value="no_show">Não compareceu</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={services.length === 0}
            onClick={() => setShowNewModal(true)}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium"
          >
            Novo agendamento
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5">
        {appointments.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum agendamento encontrado com esses filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-zinc-700">
                  <th className="py-2 pr-3">Quando</th>
                  <th className="py-2 pr-3">Serviço</th>
                  <th className="py-2 pr-3">Recurso</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Telefone</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} className="border-b border-zinc-800">
                    <td className="py-2 pr-3">{fmtDateTime(a.scheduledStart)}</td>
                    <td className="py-2 pr-3">{a.serviceName ?? "—"}</td>
                    <td className="py-2 pr-3">{a.resourceName ?? "—"}</td>
                    <td className="py-2 pr-3">{a.clientName ?? "—"}</td>
                    <td className="py-2 pr-3">{a.phoneE164 ?? "—"}</td>
                    <td className="py-2 pr-3">{statusLabel[a.status] ?? a.status}</td>
                    <td className="py-2 pr-3">
                      {a.status === "booked" ? (
                        <div className="flex gap-3">
                          <button
                            type="button"
                            className="text-cyan-400 hover:underline"
                            disabled={saving}
                            onClick={() => setRescheduleTarget(a)}
                          >
                            Reagendar
                          </button>
                          <button
                            type="button"
                            className="text-emerald-400 hover:underline"
                            disabled={saving}
                            onClick={() => void runAction(a.id, "complete", { status: "completed" })}
                          >
                            Concluir
                          </button>
                          <button
                            type="button"
                            className="text-amber-400 hover:underline"
                            disabled={saving}
                            onClick={() => void runAction(a.id, "complete", { status: "no_show" })}
                          >
                            Não veio
                          </button>
                          <button
                            type="button"
                            className="text-red-400 hover:underline"
                            disabled={saving}
                            onClick={() => void runAction(a.id, "cancel")}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showNewModal ? (
        <BookingModal
          services={services}
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          onClose={() => setShowNewModal(false)}
          onBooked={() => {
            setShowNewModal(false);
            setNotice("Agendamento criado.");
            void loadAppointments();
          }}
        />
      ) : null}

      {rescheduleTarget ? (
        <BookingModal
          services={services}
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          fixedServiceId={rescheduleTarget.serviceId}
          rescheduleAppointmentId={rescheduleTarget.id}
          onClose={() => setRescheduleTarget(null)}
          onBooked={() => {
            setRescheduleTarget(null);
            setNotice("Agendamento atualizado.");
            void loadAppointments();
          }}
        />
      ) : null}
    </div>
  );
}

function BookingModal(props: {
  services: AppointmentService[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  setError: (v: string | null) => void;
  fixedServiceId?: string;
  rescheduleAppointmentId?: string;
  onClose: () => void;
  onBooked: () => void;
}) {
  const { services, saving, setSaving, setError, fixedServiceId, rescheduleAppointmentId, onClose, onBooked } = props;
  const [serviceId, setServiceId] = useState(fixedServiceId ?? services[0]?.id ?? "");
  const [dateStr, setDateStr] = useState(todayStr());
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [clientName, setClientName] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  const loadSlots = useCallback(async () => {
    if (!serviceId || !dateStr) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    try {
      const res = await api.get(`/admin/appointments/services/${serviceId}/available-slots`, {
        params: { date: dateStr },
      });
      setSlots(unwrapApiData<AvailableSlot[]>(res.data));
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao buscar horários disponíveis"));
    } finally {
      setLoadingSlots(false);
    }
  }, [serviceId, dateStr, setError]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const confirm = async () => {
    if (!selectedSlot) {
      setError("Selecione um horário.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (rescheduleAppointmentId) {
        await api.post(`/admin/appointments/${rescheduleAppointmentId}/reschedule`, {
          scheduledStart: selectedSlot.start,
          resourceId: selectedSlot.resourceId,
        });
      } else {
        await api.post("/admin/appointments", {
          serviceId,
          resourceId: selectedSlot.resourceId,
          scheduledStart: selectedSlot.start,
          clientName,
          phoneE164,
        });
      }
      onBooked();
    } catch (e) {
      setError(getApiErrorMessage(e, "Erro ao confirmar agendamento"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-600 bg-zinc-900 p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium text-white mb-4">
          {rescheduleAppointmentId ? "Reagendar" : "Novo agendamento"}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <label className="block text-sm">
            <span className="text-gray-400 mb-1 block">Serviço</span>
            <select
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm disabled:opacity-60"
              value={serviceId}
              disabled={!!fixedServiceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-400 mb-1 block">Data</span>
            <input
              type="date"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm"
              value={dateStr}
              min={todayStr()}
              onChange={(e) => setDateStr(e.target.value)}
            />
          </label>
        </div>

        {!rescheduleAppointmentId ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <label className="block text-sm">
              <span className="text-gray-400 mb-1 block">Nome do cliente</span>
              <input
                className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-400 mb-1 block">Telefone (E.164)</span>
              <input
                className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-3 py-2 text-sm"
                placeholder="+5511999999999"
                value={phoneE164}
                onChange={(e) => setPhoneE164(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        <div className="mb-4">
          <span className="text-gray-400 mb-2 block text-sm">Horários disponíveis</span>
          {loadingSlots ? (
            <p className="text-xs text-gray-500">Buscando horários…</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-gray-500">Nenhum horário livre nessa data.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((slot, idx) => {
                const isSelected =
                  selectedSlot?.start === slot.start && selectedSlot?.resourceId === slot.resourceId;
                const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
                  new Date(slot.start)
                );
                return (
                  <button
                    key={`${slot.start}-${slot.resourceId}-${idx}`}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`px-3 py-1.5 rounded-lg text-xs border ${
                      isSelected
                        ? "bg-cyan-600 border-cyan-500 text-white"
                        : "bg-zinc-800 border-zinc-600 text-gray-200 hover:border-cyan-500"
                    }`}
                  >
                    {time}
                    {slot.resourceName ? ` · ${slot.resourceName}` : ""}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="px-3 py-2 text-sm text-gray-300 hover:text-white" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !selectedSlot}
            onClick={() => void confirm()}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
