/**
 * Classificação de falhas de campanha para retry seguro e relatório.
 */

export type CampaignFailureKind =
  | "api_rejected"
  | "delivery_failed"
  | "stale_timeout"
  | "channel_unavailable"
  | "unknown";

export type CampaignFailureInfo = {
  failureKind: CampaignFailureKind;
  failureLabel: string;
  /** Seguro reenviar sem risco típico de cobrança duplicada (sem SID aceito). */
  retrySafe: boolean;
  /** Já houve aceitação no provedor (SID) — reenvio gera nova cobrança. */
  alreadyBilled: boolean;
};

const FAILURE_LABELS: Record<CampaignFailureKind, string> = {
  api_rejected: "Rejeitado na API (não aceito pelo provedor)",
  delivery_failed: "Aceito pelo provedor, falha na entrega",
  stale_timeout: "Timeout interno no envio",
  channel_unavailable: "Canal WhatsApp indisponível",
  unknown: "Falha sem detalhe",
};

export function classifyCampaignFailure(input: {
  status: string;
  providerMessageId?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
}): CampaignFailureInfo | null {
  if (input.status !== "failed") return null;

  const desc = (input.errorDescription ?? "").trim();
  const code = (input.errorCode ?? "").trim();
  const hasSid = Boolean(input.providerMessageId?.trim());

  if (/canal whatsapp indispon[ií]vel/i.test(desc) || code === "CHANNEL_UNAVAILABLE") {
    return {
      failureKind: "channel_unavailable",
      failureLabel: FAILURE_LABELS.channel_unavailable,
      retrySafe: true,
      alreadyBilled: false,
    };
  }

  if (/timeout no envio|stale sending/i.test(desc) || code === "STALE_SENDING") {
    return {
      failureKind: "stale_timeout",
      failureLabel: FAILURE_LABELS.stale_timeout,
      retrySafe: !hasSid,
      alreadyBilled: hasSid,
    };
  }

  if (hasSid) {
    return {
      failureKind: "delivery_failed",
      failureLabel: FAILURE_LABELS.delivery_failed,
      retrySafe: false,
      alreadyBilled: true,
    };
  }

  if (desc || code) {
    return {
      failureKind: "api_rejected",
      failureLabel: FAILURE_LABELS.api_rejected,
      retrySafe: true,
      alreadyBilled: false,
    };
  }

  return {
    failureKind: "unknown",
    failureLabel: FAILURE_LABELS.unknown,
    retrySafe: true,
    alreadyBilled: false,
  };
}

export function formatFailureDetail(input: {
  errorCode?: string | null;
  errorDescription?: string | null;
}): string | null {
  const code = input.errorCode?.trim();
  const desc = input.errorDescription?.trim();
  if (code && desc) return `${code}: ${desc}`;
  if (desc) return desc;
  if (code) return code;
  return null;
}
