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
  result: VoiceCallResult | null;
  tabulacaoIsSuccess: boolean | null;
  callbackAt: string | null;
  createdAt: string;
  endedAt: string | null;
};

export type VoiceCallResult =
  | "answered"
  | "no_answer"
  | "busy"
  | "invalid_number"
  | "unavailable"
  | "carrier_failure"
  | "cancelled"
  | "voicemail";

export const voiceCallResultLabel: Record<VoiceCallResult, string> = {
  answered: "Atendida",
  no_answer: "Não atendeu",
  busy: "Ocupado",
  invalid_number: "Número inexistente",
  unavailable: "Desligado / fora de área",
  carrier_failure: "Falha na operadora",
  cancelled: "Cancelada pelo operador",
  voicemail: "Caixa postal",
};

/** Rótulo do resultado; ligações antigas sem `result` caem no status. */
export function callResultLabel(call: Pick<VoiceCall, "result" | "status">): string {
  if (call.result) return voiceCallResultLabel[call.result] ?? call.result;
  return voiceCallStatusLabel[call.status] ?? call.status;
}

export type VoiceContactOutcome = "done" | "retry" | "do_not_call" | "callback";

export const voiceOutcomeLabel: Record<VoiceContactOutcome, string> = {
  done: "Concluir contato",
  retry: "Tentar de novo depois",
  do_not_call: "Não ligar mais",
  callback: "Agendar retorno",
};

export type CallTabulacaoOption = {
  id: string;
  label: string;
  description: string | null;
  outcome: VoiceContactOutcome | null;
  isSuccess: boolean;
};

export type VoiceCampaignTabulacao = {
  id: string;
  campaignId: string;
  label: string;
  description: string | null;
  outcome: VoiceContactOutcome;
  isSuccess: boolean;
  sortOrder: number;
  active: boolean;
};

export type AgentVoiceCampaign = {
  id: string;
  name: string;
  queueLabels: string[];
  readyNow: number;
  scheduled: number;
  nextRetryAt: string | null;
  myCallbacks: number;
  nextMyCallbackAt: string | null;
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
    lastCallResult: VoiceCallResult | null;
    callbackAt: string | null;
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
    invalid: number;
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
