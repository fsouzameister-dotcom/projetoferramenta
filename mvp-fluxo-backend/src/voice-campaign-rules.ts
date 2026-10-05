/** Regras puras das campanhas de voz (preview) — sem banco, testáveis isoladamente. */

import { normalizeBrPhone } from "./telephony-rules";

export type VoiceContactStatus =
  | "pending"
  | "in_call"
  | "retry"
  | "done"
  | "exhausted"
  | "do_not_call";

export type VoiceContactOutcome = "done" | "retry" | "do_not_call";

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

/**
 * Próximo estado do contato após uma tentativa.
 * `outcome` vem da tabulação; sem ela, ligação atendida conclui e as demais voltam para nova tentativa.
 */
export function resolveContactAfterAttempt(input: {
  callAnswered: boolean;
  attempts: number;
  maxAttempts: number;
  retryIntervalMinutes: number;
  outcome?: VoiceContactOutcome | null;
  now?: Date;
}): { status: VoiceContactStatus; nextAttemptAt: Date | null } {
  const outcome: VoiceContactOutcome = input.outcome ?? (input.callAnswered ? "done" : "retry");
  if (outcome === "done") return { status: "done", nextAttemptAt: null };
  if (outcome === "do_not_call") return { status: "do_not_call", nextAttemptAt: null };
  if (input.attempts >= input.maxAttempts) return { status: "exhausted", nextAttemptAt: null };
  const now = input.now ?? new Date();
  return {
    status: "retry",
    nextAttemptAt: new Date(now.getTime() + input.retryIntervalMinutes * 60_000),
  };
}

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
