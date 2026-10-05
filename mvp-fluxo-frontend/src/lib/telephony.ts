export type VoiceCallStatus =
  | "requested"
  | "authorized"
  | "answered"
  | "no_answer"
  | "busy"
  | "cancelled"
  | "failed";

export type VoiceCall = {
  id: string;
  userId: string | null;
  userName: string | null;
  phone: string;
  status: VoiceCallStatus;
  dialStatus: string | null;
  hangupCause: string | null;
  ringSeconds: number;
  talkSeconds: number;
  tabulacaoId: string | null;
  tabulacaoLabel: string | null;
  campaignId: string | null;
  campaignName: string | null;
  contactName: string | null;
  recorded: boolean;
  createdAt: string;
  endedAt: string | null;
};

export type VoiceContactOutcome = "done" | "retry" | "do_not_call";

export const voiceOutcomeOptions: { value: VoiceContactOutcome; label: string }[] = [
  { value: "done", label: "Concluir contato" },
  { value: "retry", label: "Tentar mais tarde" },
  { value: "do_not_call", label: "Não ligar mais" },
];

export type AgentVoiceCampaign = {
  id: string;
  name: string;
  queueLabels: string[];
  readyNow: number;
  scheduled: number;
  nextRetryAt: string | null;
};

export type NextVoiceContact = {
  callId: string;
  dialNumber: string;
  campaign: { id: string; name: string; recordCalls: boolean };
  contact: {
    id: string;
    name: string | null;
    phone: string;
    data: Record<string, string>;
    attempts: number;
    maxAttempts: number;
    lastTabulacaoLabel: string | null;
  };
};

export type VoiceCampaignStatus = "active" | "paused" | "completed";

export const voiceCampaignStatusLabel: Record<VoiceCampaignStatus, string> = {
  active: "Ativa",
  paused: "Pausada",
  completed: "Encerrada",
};

export type VoiceCampaignSummary = {
  id: string;
  name: string;
  status: VoiceCampaignStatus;
  maxAttempts: number;
  retryIntervalMinutes: number;
  recordCalls: boolean;
  queueIds: string[];
  queueLabels: string[];
  createdAt: string;
  counts: {
    total: number;
    pending: number;
    retry: number;
    inCall: number;
    done: number;
    exhausted: number;
    doNotCall: number;
    readyNow: number;
  };
};

export type VoiceImportResult = {
  imported: number;
  duplicates: number;
  invalidCount: number;
  invalid: { line: number; value: string }[];
};

export type VoiceSpreadsheetPreview = {
  headers: string[];
  totalRows: number;
  sampleRows: Record<string, string>[];
  suggestedPhoneColumn: string | null;
  suggestedNameColumn: string | null;
};

export const voiceCallStatusLabel: Record<VoiceCallStatus, string> = {
  requested: "Iniciando",
  authorized: "Em andamento",
  answered: "Atendida",
  no_answer: "Não atendeu",
  busy: "Ocupado",
  cancelled: "Cancelada",
  failed: "Falhou",
};

export function formatBrPhone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatCallDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
