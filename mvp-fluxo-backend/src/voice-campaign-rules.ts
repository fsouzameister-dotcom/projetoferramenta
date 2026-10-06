/** Regras puras das campanhas de voz (preview) — sem banco, testáveis isoladamente. */

import { normalizeBrPhone, type VoiceCallResult } from "./telephony-rules";

export type VoiceContactStatus =
  | "pending"
  | "in_call"
  | "retry"
  | "done"
  | "exhausted"
  | "do_not_call"
  | "invalid";

export type VoiceContactOutcome = "done" | "retry" | "do_not_call" | "callback";

export const VOICE_CONTACT_OUTCOMES: VoiceContactOutcome[] = ["done", "retry", "do_not_call", "callback"];

/** Ocupado e falha de operadora voltam mais cedo que o intervalo normal da campanha. */
export const QUICK_RETRY_MINUTES = 15;

/** Retorno agendado para um operador: se ele não puxar até este prazo, qualquer um da fila pode. */
export const CALLBACK_OWNER_GRACE_MINUTES = 15;

export const MAX_CALLBACK_DAYS = 60;

export type VoiceCampaignStatus = "active" | "paused" | "completed";

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_RETRY_INTERVAL_MINUTES = 60;

export function clampMaxAttempts(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_MAX_ATTEMPTS;
  return Math.min(20, Math.max(1, n));
}

export function clampRetryIntervalMinutes(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_RETRY_INTERVAL_MINUTES;
  return Math.min(7 * 24 * 60, Math.max(5, n));
}

export type ContactNextState = { status: VoiceContactStatus; nextAttemptAt: Date | null };

/**
 * Próximo estado do contato após uma tentativa.
 * `outcome` vem da tabulação; sem ela, ligação atendida conclui e as demais voltam para nova tentativa.
 * Retorno agendado (`callback`) não esgota: o combinado com o entrevistado vale mesmo na última tentativa.
 */
export function resolveContactAfterAttempt(input: {
  callAnswered: boolean;
  attempts: number;
  maxAttempts: number;
  retryIntervalMinutes: number;
  outcome?: VoiceContactOutcome | null;
  callbackAt?: Date | null;
  now?: Date;
}): ContactNextState {
  const outcome: VoiceContactOutcome = input.outcome ?? (input.callAnswered ? "done" : "retry");
  if (outcome === "done") return { status: "done", nextAttemptAt: null };
  if (outcome === "do_not_call") return { status: "do_not_call", nextAttemptAt: null };
  if (outcome === "callback" && input.callbackAt) return { status: "retry", nextAttemptAt: input.callbackAt };
  if (input.attempts >= input.maxAttempts) return { status: "exhausted", nextAttemptAt: null };
  const now = input.now ?? new Date();
  return {
    status: "retry",
    nextAttemptAt: new Date(now.getTime() + input.retryIntervalMinutes * 60_000),
  };
}

/**
 * Destino automático de ligação não atendida (sem tabulação do operador).
 * Retorna null para "atendida": nesse caso o destino vem da tabulação.
 */
export function resolveContactAfterResult(input: {
  result: VoiceCallResult;
  attempts: number;
  maxAttempts: number;
  retryIntervalMinutes: number;
  now?: Date;
}): ContactNextState | null {
  if (input.result === "answered") return null;
  if (input.result === "invalid_number") return { status: "invalid", nextAttemptAt: null };
  if (input.attempts >= input.maxAttempts) return { status: "exhausted", nextAttemptAt: null };
  const quick = input.result === "busy" || input.result === "carrier_failure";
  const minutes = quick ? Math.min(QUICK_RETRY_MINUTES, input.retryIntervalMinutes) : input.retryIntervalMinutes;
  const now = input.now ?? new Date();
  return { status: "retry", nextAttemptAt: new Date(now.getTime() + minutes * 60_000) };
}

/** Valida a data de retorno escolhida pelo operador (futuro, até MAX_CALLBACK_DAYS). */
export function parseCallbackAt(raw: unknown, now: Date = new Date()): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() < now.getTime() - 60_000) return null;
  if (date.getTime() > now.getTime() + MAX_CALLBACK_DAYS * 24 * 60 * 60_000) return null;
  return date;
}

export type CampaignTabulacaoSeed = {
  label: string;
  description: string | null;
  outcome: VoiceContactOutcome;
  isSuccess: boolean;
};

/** Tabulações iniciais de toda campanha nova (editáveis pelo admin). */
export const DEFAULT_CAMPAIGN_TABULACOES: CampaignTabulacaoSeed[] = [
  { label: "Entrevista concluída", description: null, outcome: "done", isSuccess: true },
  { label: "Pediu retorno", description: "Agendar data e hora para ligar de novo", outcome: "callback", isSuccess: false },
  { label: "Pessoa não estava", description: "Tentar de novo depois", outcome: "retry", isSuccess: false },
  { label: "Recusou participar", description: null, outcome: "do_not_call", isSuccess: false },
  { label: "Número errado", description: "Não é a pessoa da lista", outcome: "do_not_call", isSuccess: false },
];

export type PreparedVoiceContact = {
  phone: string;
  name: string | null;
  data: Record<string, string>;
};

export type PreparedVoiceImport = {
  contacts: PreparedVoiceContact[];
  invalid: { line: number; value: string }[];
  duplicates: number;
};

/** Valida e deduplica as linhas da planilha. `line` considera o cabeçalho como linha 1. */
export function prepareVoiceContacts(input: {
  rows: Record<string, string>[];
  phoneColumn: string;
  nameColumn?: string | null;
}): PreparedVoiceImport {
  const seen = new Set<string>();
  const contacts: PreparedVoiceContact[] = [];
  const invalid: { line: number; value: string }[] = [];
  let duplicates = 0;
  input.rows.forEach((row, idx) => {
    const raw = String(row[input.phoneColumn] ?? "").trim();
    const normalized = normalizeBrPhone(raw);
    if (!normalized) {
      invalid.push({ line: idx + 2, value: raw });
      return;
    }
    if (seen.has(normalized.digits)) {
      duplicates += 1;
      return;
    }
    seen.add(normalized.digits);
    const name = input.nameColumn ? String(row[input.nameColumn] ?? "").trim() : "";
    contacts.push({ phone: normalized.digits, name: name || null, data: row });
  });
  return { contacts, invalid, duplicates };
}

/** Sugere colunas pelo cabeçalho (sem acento/caixa). */
export function suggestColumn(headers: string[], candidates: string[]): string | null {
  const norm = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const wanted = candidates.map(norm);
  for (const w of wanted) {
    const exact = headers.find((h) => norm(h) === w);
    if (exact) return exact;
  }
  for (const w of wanted) {
    const partial = headers.find((h) => norm(h).includes(w));
    if (partial) return partial;
  }
  return null;
}
