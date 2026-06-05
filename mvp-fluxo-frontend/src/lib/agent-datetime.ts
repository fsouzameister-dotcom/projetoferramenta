/** Fuso exibido na Central do Agente (horário de Brasília). */
export const BRAZIL_AGENT_TZ = "America/Sao_Paulo";

function sameCalendarDayInTz(a: Date, b: Date, timeZone: string): boolean {
  const fmt = (d: Date) =>
    d.toLocaleDateString("pt-BR", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  return fmt(a) === fmt(b);
}

/** Hora da mensagem no fuso do agente; inclui data se não for hoje. */
export function formatMessageTime(isoOrDate: string | Date, now = new Date()): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "";
  const timePart = d.toLocaleTimeString("pt-BR", {
    timeZone: BRAZIL_AGENT_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameCalendarDayInTz(d, now, BRAZIL_AGENT_TZ)) return timePart;
  const datePart = d.toLocaleDateString("pt-BR", {
    timeZone: BRAZIL_AGENT_TZ,
    day: "2-digit",
    month: "2-digit",
  });
  return `${datePart} ${timePart}`;
}

export function messageTimestampNow(): { created_at: string; createdAt: string } {
  const now = new Date();
  return {
    created_at: now.toISOString(),
    createdAt: formatMessageTime(now),
  };
}

export function displayMessageTime(msg: {
  created_at?: string;
  createdAt: string;
}): string {
  if (msg.created_at) return formatMessageTime(msg.created_at);
  return msg.createdAt;
}
