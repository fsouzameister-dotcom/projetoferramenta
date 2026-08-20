/**
 * Node de fluxo "Agendamento": conduz o cliente por (1) escolher a data desejada,
 * (2) escolher um horário livre dentre os calculados via appointment-availability,
 * e (3) confirmar a reserva. Reaproveita o mesmo formato de "awaiting_input" do
 * capturar_entrada (CapturarEntradaAwaiting) para não exigir mudanças na sessão
 * inbound / entrega WhatsApp — cada fase é, na prática, uma pergunta de texto ou
 * de escolha única.
 */
import { ApiError, ERROR_CODES } from "./http";
import type { CapturarEntradaAwaiting } from "./capturar-entrada";
import {
  createAppointment,
  getAppointmentService,
  getAvailableSlots,
  type AvailableSlot,
} from "./appointments";
import { resolveFlowTemplate } from "./flow-template";

export type AgendamentoNodeConfig = {
  serviceId: string;
  variableName: string;
  askDatePrompt: string;
  invalidDateMessage: string;
  noSlotsMessage: string;
  invalidChoiceMessage: string;
  confirmationMessage: string;
  maxSlotsShown: number;
  clientNameVariable?: string;
  next_node_id: string | null;
  noSlotsNextNodeId: string | null;
};

export type AgendamentoExecutionResult = {
  nextNodeId: string | null;
  details: Record<string, unknown>;
  awaitingInput?: CapturarEntradaAwaiting;
  capturedMessage?: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function parseAgendamentoNodeConfig(raw: unknown, _nodeId: string): AgendamentoNodeConfig {
  const c = asObject(raw);
  return {
    serviceId: typeof c.serviceId === "string" ? c.serviceId.trim() : "",
    variableName:
      typeof c.variableName === "string" && c.variableName.trim() ? c.variableName.trim() : "agendamento",
    askDatePrompt:
      typeof c.askDatePrompt === "string" && c.askDatePrompt.trim()
        ? c.askDatePrompt.trim()
        : "Para qual dia você deseja agendar? (ex.: 21/08 ou 21/08/2026)",
    invalidDateMessage:
      typeof c.invalidDateMessage === "string" && c.invalidDateMessage.trim()
        ? c.invalidDateMessage.trim()
        : "Não entendi a data. Envie no formato DD/MM (ex.: 21/08).",
    noSlotsMessage:
      typeof c.noSlotsMessage === "string" && c.noSlotsMessage.trim()
        ? c.noSlotsMessage.trim()
        : "Não há horários livres nesse dia. Envie outra data (DD/MM).",
    invalidChoiceMessage:
      typeof c.invalidChoiceMessage === "string" && c.invalidChoiceMessage.trim()
        ? c.invalidChoiceMessage.trim()
        : "Não entendi. Responda apenas com o número da opção desejada.",
    confirmationMessage:
      typeof c.confirmationMessage === "string" && c.confirmationMessage.trim()
        ? c.confirmationMessage.trim()
        : "Agendamento confirmado para {{agendamento_data}} às {{agendamento_hora}}. ✅",
    maxSlotsShown:
      typeof c.maxSlotsShown === "number" && c.maxSlotsShown > 0 ? Math.floor(c.maxSlotsShown) : 8,
    clientNameVariable:
      typeof c.clientNameVariable === "string" && c.clientNameVariable.trim()
        ? c.clientNameVariable.trim()
        : undefined,
    next_node_id: typeof c.next_node_id === "string" ? c.next_node_id : null,
    noSlotsNextNodeId: typeof c.noSlotsNextNodeId === "string" ? c.noSlotsNextNodeId : null,
  };
}

function formatDateInTz(date: Date, timeZone: string): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    date
  );
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Interpreta datas em linguagem livre comum no WhatsApp (DD/MM, DD/MM/AAAA, ISO, "hoje"/"amanhã"). */
export function parseUserDateInput(
  raw: string,
  now: Date = new Date(),
  timezone = "America/Sao_Paulo"
): string | null {
  const text = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!text) return null;
  const todayStr = formatDateInTz(now, timezone);
  if (text === "hoje") return todayStr;
  if (text === "amanha") return addDaysToDateStr(todayStr, 1);

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const candidate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    return Number.isNaN(new Date(`${candidate}T00:00:00Z`).getTime()) ? null : candidate;
  }

  const brMatch = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, "0");
    const month = brMatch[2].padStart(2, "0");
    let year = brMatch[3];
    if (!year) {
      year = todayStr.slice(0, 4);
    } else if (year.length === 2) {
      year = `20${year}`;
    }
    let candidate = `${year}-${month}-${day}`;
    if (Number.isNaN(new Date(`${candidate}T00:00:00Z`).getTime())) return null;
    if (!brMatch[3] && candidate < todayStr) {
      candidate = `${Number(year) + 1}-${month}-${day}`;
    }
    return candidate;
  }

  return null;
}

export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export function formatSlotTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

export function formatSlotLabel(slot: AvailableSlot, timezone: string): string {
  const time = formatSlotTime(slot.start, timezone);
  return slot.resourceName ? `${time} — ${slot.resourceName}` : time;
}

function buildSlotOptions(slots: AvailableSlot[], timezone: string): { id: string; label: string }[] {
  return slots.map((s, idx) => ({ id: String(idx + 1), label: formatSlotLabel(s, timezone) }));
}

function buildSlotPrompt(header: string, options: { id: string; label: string }[]): string {
  return [header, ...options.map((o) => `${o.id}. ${o.label}`)].join("\n");
}

export async function executeAgendamentoNode(
  node: { id: string },
  config: AgendamentoNodeConfig,
  variables: Record<string, unknown>,
  tenantId: string,
  input: { userInput?: string | string[]; phone?: string }
): Promise<AgendamentoExecutionResult> {
  if (!config.serviceId) {
    throw new ApiError(
      400,
      ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
      "Node de agendamento sem serviço configurado"
    );
  }
  const serviceRow = await getAppointmentService(tenantId, config.serviceId);
  if (!serviceRow) {
    throw new ApiError(
      400,
      ERROR_CODES.execution.FLOW_EXECUTION_INVALID,
      "Serviço de agendamento não encontrado/inválido para este node"
    );
  }
  const service = serviceRow;

  const varName = config.variableName;
  const phaseKey = `${varName}_phase`;
  const slotsKey = `__${varName}_slots`;
  const phase = (variables[phaseKey] as string) ?? "ask_date";
  const hasInput = input.userInput !== undefined && input.userInput !== null;
  const rawInput = (Array.isArray(input.userInput) ? input.userInput.join(" ") : String(input.userInput ?? "")).trim();

  const askDateAwaiting = (prompt: string): CapturarEntradaAwaiting => ({
    nodeId: node.id,
    prompt,
    promptKey: `${varName}_date`,
    inputMode: "text",
    options: [],
    minSelections: 1,
    maxSelections: 1,
    variableName: `${varName}_date_raw`,
  });

  const askSlotAwaiting = (
    prompt: string,
    options: { id: string; label: string }[]
  ): CapturarEntradaAwaiting => ({
    nodeId: node.id,
    prompt,
    promptKey: `${varName}_slot`,
    inputMode: "single_choice",
    options,
    minSelections: 1,
    maxSelections: 1,
    variableName: `${varName}_slot_choice`,
  });

  async function offerSlotsForDate(
    dateStr: string,
    header: string
  ): Promise<AgendamentoExecutionResult> {
    const slots = await getAvailableSlots(tenantId, config.serviceId, dateStr);
    if (slots.length === 0) {
      if (config.noSlotsNextNodeId) {
        variables[phaseKey] = null;
        variables[`${varName}_date`] = dateStr;
        return {
          nextNodeId: config.noSlotsNextNodeId,
          capturedMessage: config.noSlotsMessage,
          details: { agendamentoPhase: "no_slots", date: dateStr },
        };
      }
      variables[phaseKey] = "ask_date";
      return {
        nextNodeId: null,
        awaitingInput: askDateAwaiting(config.noSlotsMessage),
        capturedMessage: config.noSlotsMessage,
        details: { agendamentoPhase: "ask_date", noSlots: true, date: dateStr },
      };
    }
    const limited = slots.slice(0, config.maxSlotsShown);
    variables[phaseKey] = "ask_slot";
    variables[`${varName}_date`] = dateStr;
    variables[slotsKey] = limited;
    const options = buildSlotOptions(limited, service.timezone);
    const prompt = buildSlotPrompt(header, options);
    return {
      nextNodeId: null,
      awaitingInput: askSlotAwaiting(prompt, options),
      capturedMessage: prompt,
      details: { agendamentoPhase: "ask_slot", date: dateStr, slotsCount: limited.length },
    };
  }

  if (phase === "ask_slot") {
    const slotsRaw = variables[slotsKey];
    const slots: AvailableSlot[] = Array.isArray(slotsRaw) ? (slotsRaw as AvailableSlot[]) : [];
    if (!hasInput || slots.length === 0) {
      variables[phaseKey] = "ask_date";
      return {
        nextNodeId: null,
        awaitingInput: askDateAwaiting(config.askDatePrompt),
        capturedMessage: config.askDatePrompt,
        details: { agendamentoPhase: "ask_date", restarted: true },
      };
    }
    const idx = Number(rawInput);
    const chosen = Number.isInteger(idx) && idx >= 1 && idx <= slots.length ? slots[idx - 1] : undefined;
    if (!chosen) {
      const options = buildSlotOptions(slots, service.timezone);
      return {
        nextNodeId: null,
        awaitingInput: askSlotAwaiting(config.invalidChoiceMessage, options),
        capturedMessage: config.invalidChoiceMessage,
        details: { agendamentoPhase: "ask_slot", invalid: true },
      };
    }

    const clientName = config.clientNameVariable
      ? String(variables[config.clientNameVariable] ?? "").trim() || undefined
      : undefined;

    try {
      const created = await createAppointment({
        tenantId,
        serviceId: config.serviceId,
        resourceId: chosen.resourceId,
        scheduledStart: chosen.start,
        clientName,
        phoneE164: input.phone,
        metadata: { source: "flow", nodeId: node.id },
      });
      variables[phaseKey] = null;
      delete variables[slotsKey];
      variables[`${varName}_id`] = created.id;
      variables[`${varName}_start`] = created.scheduledStart;
      variables[`${varName}_end`] = created.scheduledEnd;
      variables[`${varName}_data`] = formatDateLabel(created.scheduledStart.slice(0, 10));
      variables[`${varName}_hora`] = formatSlotTime(created.scheduledStart, service.timezone);
      if (created.resourceName) variables[`${varName}_recurso`] = created.resourceName;

      const confirmMsg = resolveFlowTemplate(config.confirmationMessage, variables);
      return {
        nextNodeId: config.next_node_id,
        capturedMessage: confirmMsg,
        details: { agendamentoPhase: "confirmed", appointmentId: created.id },
      };
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "APPOINTMENT_SLOT_TAKEN") {
        const dateStr = String(variables[`${varName}_date`] ?? "");
        return offerSlotsForDate(dateStr, "Esse horário acabou de ser ocupado. Escolha outro:");
      }
      throw err;
    }
  }

  // phase === "ask_date" (padrão)
  if (!hasInput) {
    variables[phaseKey] = "ask_date";
    return {
      nextNodeId: null,
      awaitingInput: askDateAwaiting(config.askDatePrompt),
      capturedMessage: config.askDatePrompt,
      details: { agendamentoPhase: "ask_date" },
    };
  }
  const dateStr = parseUserDateInput(rawInput, new Date(), service.timezone);
  if (!dateStr) {
    return {
      nextNodeId: null,
      awaitingInput: askDateAwaiting(config.invalidDateMessage),
      capturedMessage: config.invalidDateMessage,
      details: { agendamentoPhase: "ask_date", invalid: true },
    };
  }
  return offerSlotsForDate(dateStr, `Horários disponíveis para ${formatDateLabel(dateStr)}:`);
}
