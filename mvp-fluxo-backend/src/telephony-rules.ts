/** Regras puras da telefonia (sem banco/rede) — testáveis isoladamente. */

export type VoiceCallStatus =
  | "requested"
  | "authorized"
  | "answered"
  | "no_answer"
  | "busy"
  | "cancelled"
  | "failed";

/** Intervalo mínimo entre pedidos de ligação do mesmo atendente (evita "rajada" no tronco). */
export const MIN_SECONDS_BETWEEN_CALLS = 5;

/** Pedido de ligação que não chegou ao Asterisk dentro deste prazo é considerado abandonado. */
export const REQUEST_AUTHORIZE_WINDOW_SECONDS = 60;

export type BrPhoneKind = "mobile" | "landline";

export type NormalizedBrPhone = {
  /** DDD + número (10 ou 11 dígitos), formato aceito pelo dialplan `clienton-saida`. */
  digits: string;
  kind: BrPhoneKind;
};

/**
 * Normaliza telefone brasileiro para DDD + número.
 * Aceita +55, 55, 0 + DDD, espaços e pontuação. Só celular (DDD + 9 + 8 dígitos)
 * e fixo (DDD + [2-5] + 7 dígitos); o resto (0800, 0900, internacional, curtos) é rejeitado.
 */
export function normalizeBrPhone(raw: string | null | undefined): NormalizedBrPhone | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  } else if ((digits.length === 11 || digits.length === 12) && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (!/^[1-9][1-9]/.test(digits)) return null;
  if (digits.length === 11 && digits[2] === "9") {
    return { digits, kind: "mobile" };
  }
  if (digits.length === 10 && /[2-5]/.test(digits[2])) {
    return { digits, kind: "landline" };
  }
  return null;
}

/** Converte o DIALSTATUS do Asterisk no status final da ligação. */
export function mapDialStatusToCallStatus(dialStatus: string | null | undefined): VoiceCallStatus {
  switch (String(dialStatus ?? "").trim().toUpperCase()) {
    case "ANSWER":
      return "answered";
    case "NOANSWER":
      return "no_answer";
    case "BUSY":
      return "busy";
    case "CANCEL":
      return "cancelled";
    default:
      return "failed";
  }
}

/** Nome do ramal PJSIP do usuário no Asterisk (também é o usuário SIP). */
export function sipUsernameForUser(userId: string): string {
  const hex = userId.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length < 12) throw new Error("TELEPHONY_INVALID_USER_ID");
  return `ag_${hex}`;
}

export function parseNonNegativeInt(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Segundos de toque = tempo total de discagem menos o tempo falado. */
export function computeCallDurations(input: { dialedSeconds: unknown; answeredSeconds: unknown }): {
  ringSeconds: number;
  talkSeconds: number;
} {
  const dialed = parseNonNegativeInt(input.dialedSeconds);
  const talk = parseNonNegativeInt(input.answeredSeconds);
  return { ringSeconds: Math.max(0, dialed - talk), talkSeconds: talk };
}
