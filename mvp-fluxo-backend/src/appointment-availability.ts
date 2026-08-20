/**
 * Cálculo de horários livres para agendamentos (puro, sem I/O).
 * Suporta dois modos:
 *  - "pool": N vagas simultâneas, sem recurso nomeado (ex.: fila de exames).
 *  - "resource": cada slot precisa de um recurso livre (profissional, sala, imóvel...).
 */

export type AppointmentCapacityMode = "pool" | "resource";

export type SlotServiceInput = {
  durationMinutes: number;
  capacityMode: AppointmentCapacityMode;
  poolCapacity: number;
  timezone: string;
};

/** Regra de expediente. resourceId nulo = regra do serviço (pool) ou expediente padrão herdado pelos recursos sem regra própria. */
export type SlotRuleInput = {
  resourceId: string | null;
  weekday: number; // 0=domingo .. 6=sábado
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
};

export type SlotResourceInput = {
  id: string;
  name: string;
};

export type SlotBusyInput = {
  resourceId: string | null;
  start: string; // ISO
  end: string; // ISO
};

export type SlotBlockInput = {
  resourceId: string | null;
  start: string; // ISO
  end: string; // ISO
};

export type AvailableSlot = {
  start: string; // ISO
  end: string; // ISO
  resourceId: string | null;
  resourceName?: string;
};

const MAX_SLOTS_RETURNED = 50;

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map((n) => Number(n));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Converte uma data/hora "de parede" (ano/mês/dia/hora/min) num fuso horário
 * específico para o instante UTC correspondente. Truque padrão via Intl,
 * suficiente para fusos sem meia-hora de DST (ex.: America/Sao_Paulo, que
 * não tem horário de verão desde 2019).
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const asUtcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(asUtcGuess));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const reinterpreted = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second)
  );
  const offset = reinterpreted - asUtcGuess;
  return new Date(asUtcGuess - offset);
}

function slotsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function candidateSlotsForRule(
  dateStr: string,
  rule: SlotRuleInput,
  durationMinutes: number,
  timezone: string
): { start: Date; end: Date }[] {
  const [year, month, day] = dateStr.split("-").map(Number);
  const startMin = timeToMinutes(rule.startTime);
  const endMin = timeToMinutes(rule.endTime);
  const slots: { start: Date; end: Date }[] = [];
  for (let m = startMin; m + durationMinutes <= endMin; m += durationMinutes) {
    const start = zonedWallTimeToUtc(year, month, day, Math.floor(m / 60), m % 60, timezone);
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    slots.push({ start, end });
  }
  return slots;
}

function weekdayForDateStr(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function computeAvailableSlotsForDate(input: {
  dateStr: string; // "YYYY-MM-DD", data de calendário no fuso do serviço
  service: SlotServiceInput;
  rules: SlotRuleInput[];
  resources: SlotResourceInput[];
  busy: SlotBusyInput[];
  blocks: SlotBlockInput[];
  now?: Date;
  minLeadMinutes?: number;
}): AvailableSlot[] {
  const { service, rules, resources, busy, blocks } = input;
  const now = input.now ?? new Date();
  const minLeadMs = (input.minLeadMinutes ?? 0) * 60_000;
  const weekday = weekdayForDateStr(input.dateStr);
  const results: AvailableSlot[] = [];

  const isBlocked = (resourceId: string | null, start: Date, end: Date): boolean =>
    blocks.some((b) => {
      if (b.resourceId !== null && b.resourceId !== resourceId) return false;
      return slotsOverlap(start.getTime(), end.getTime(), new Date(b.start).getTime(), new Date(b.end).getTime());
    });

  if (service.capacityMode === "pool") {
    const ownRules = rules.filter((r) => r.resourceId === null && r.weekday === weekday);
    for (const rule of ownRules) {
      const candidates = candidateSlotsForRule(input.dateStr, rule, service.durationMinutes, service.timezone);
      for (const { start, end } of candidates) {
        if (start.getTime() < now.getTime() + minLeadMs) continue;
        if (isBlocked(null, start, end)) continue;
        const overlappingCount = busy.filter((b) =>
          slotsOverlap(start.getTime(), end.getTime(), new Date(b.start).getTime(), new Date(b.end).getTime())
        ).length;
        if (overlappingCount < service.poolCapacity) {
          results.push({ start: start.toISOString(), end: end.toISOString(), resourceId: null });
        }
      }
    }
  } else {
    for (const resource of resources) {
      const ownRules = rules.filter((r) => r.resourceId === resource.id && r.weekday === weekday);
      const effectiveRules = ownRules.length
        ? ownRules
        : rules.filter((r) => r.resourceId === null && r.weekday === weekday);
      for (const rule of effectiveRules) {
        const candidates = candidateSlotsForRule(input.dateStr, rule, service.durationMinutes, service.timezone);
        for (const { start, end } of candidates) {
          if (start.getTime() < now.getTime() + minLeadMs) continue;
          if (isBlocked(resource.id, start, end)) continue;
          const isBusy = busy.some(
            (b) =>
              b.resourceId === resource.id &&
              slotsOverlap(start.getTime(), end.getTime(), new Date(b.start).getTime(), new Date(b.end).getTime())
          );
          if (!isBusy) {
            results.push({
              start: start.toISOString(),
              end: end.toISOString(),
              resourceId: resource.id,
              resourceName: resource.name,
            });
          }
        }
      }
    }
  }

  results.sort((a, b) => a.start.localeCompare(b.start) || (a.resourceName ?? "").localeCompare(b.resourceName ?? ""));
  return results.slice(0, MAX_SLOTS_RETURNED);
}
