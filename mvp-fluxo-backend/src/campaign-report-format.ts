export type CampaignReportRow = {
  campaignId: string;
  campaignName: string;
  flowId: string | null;
  dispatchedAt: string | null;
  phone: string;
  channelLabel: string | null;
  provider: string | null;
  deliveryStatus: string;
  firstReply: string | null;
  firstReplyAt: string | null;
  attendanceStatus: string;
  transferQueue: string | null;
  transferAt: string | null;
  protocolNumber: string | null;
  tabulacaoLabel: string | null;
};

export function campaignReportToCsv(rows: CampaignReportRow[]): string {
  const headers = [
    "Campanha",
    "Fluxo",
    "Data/Hora disparo",
    "Telefone",
    "Canal",
    "Provedor",
    "Status envio",
    "Primeira resposta",
    "Data/Hora resposta",
    "Status atendimento",
    "Fila transferência",
    "Data/Hora transferência",
    "Protocolo",
    "Tabulação",
  ];
  const lines = [headers.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.campaignName,
        r.flowId ?? "",
        r.dispatchedAt ?? "",
        r.phone,
        r.channelLabel ?? "",
        r.provider ?? "",
        r.deliveryStatus,
        r.firstReply ?? "",
        r.firstReplyAt ?? "",
        r.attendanceStatus,
        r.transferQueue ?? "",
        r.transferAt ?? "",
        r.protocolNumber ?? "",
        r.tabulacaoLabel ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";")
    );
  }
  return lines.join("\n");
}
