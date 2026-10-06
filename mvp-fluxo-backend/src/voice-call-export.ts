import * as XLSX from "xlsx";
import { pool } from "./db";
import { listTenantCallsForExport, type TenantCallFilter } from "./telephony";
import { VOICE_CALL_RESULT_LABELS, type VoiceCallResult } from "./telephony-rules";

const TZ = "America/Sao_Paulo";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso)
  );
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(
    new Date(iso)
  );
}

function formatDateTime(iso: string | null): string {
  return iso ? `${formatDate(iso)} ${formatTime(iso).slice(0, 5)}` : "";
}

function formatHms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatPhone(digits: string): string {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

/** Planilha detalhada de ligações. Com uma campanha filtrada, inclui as colunas originais do mailing. */
export async function buildVoiceCallsXlsx(filter: TenantCallFilter): Promise<{ buffer: Buffer; filename: string }> {
  const calls = await listTenantCallsForExport(filter);

  let mailingHeaders: string[] = [];
  let campaignSlug = "";
  if (filter.campaignId && /^[0-9a-f-]{36}$/i.test(filter.campaignId)) {
    const campaign = await pool.query(`SELECT name, headers FROM voice_campaigns WHERE id = $1::uuid AND tenant_id = $2::uuid`, [
      filter.campaignId,
      filter.tenantId,
    ]);
    const row = campaign.rows[0];
    if (row) {
      mailingHeaders = Array.isArray(row.headers) ? (row.headers as string[]).map(String) : [];
      campaignSlug = `-${String(row.name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()}`;
    }
  }

  const baseHeaders = [
    "Data",
    "Hora",
    "Operador",
    "Campanha",
    "Contato",
    "Telefone",
    "Resultado",
    "Tabulação",
    "Sucesso",
    "Retorno agendado",
    "Tempo de toque (s)",
    "Tempo falado",
    "Tempo falado (s)",
    "Gravada",
    "ID da ligação",
  ];
  const mailingColumns = mailingHeaders.filter((h) => !baseHeaders.includes(h));
  const header = [...baseHeaders, ...mailingColumns];

  const rows = calls.map((c) => {
    const resultLabel = c.result ? (VOICE_CALL_RESULT_LABELS[c.result as VoiceCallResult] ?? c.result) : "";
    const base = [
      formatDate(c.createdAt),
      formatTime(c.createdAt),
      c.userName ?? "",
      c.campaignName ?? "Manual",
      c.contactName ?? "",
      formatPhone(c.phone),
      resultLabel,
      c.tabulacaoLabel ?? "",
      c.tabulacaoIsSuccess == null ? "" : c.tabulacaoIsSuccess ? "Sim" : "Não",
      formatDateTime(c.callbackAt),
      c.ringSeconds,
      formatHms(c.talkSeconds),
      c.talkSeconds,
      c.recorded && c.result !== null && ["answered", "voicemail"].includes(c.result) ? "Sim" : "Não",
      c.id,
    ];
    return [...base, ...mailingColumns.map((h) => c.contactData?.[h] ?? "")];
  });

  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = header.map((h) => ({ wch: Math.min(40, Math.max(10, h.length + 2)) }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Ligações");
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const period = [filter.from, filter.to].filter(Boolean).join("_a_") || "todas";
  return { buffer, filename: `ligacoes${campaignSlug}-${period}.xlsx` };
}
