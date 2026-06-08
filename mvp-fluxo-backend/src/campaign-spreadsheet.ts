import * as XLSX from "xlsx";

export type ParsedSpreadsheet = {
  headers: string[];
  rows: Record<string, string>[];
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function normalizeCell(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function sheetToRows(sheet: XLSX.WorkSheet): ParsedSpreadsheet {
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (!matrix.length) {
    return { headers: [], rows: [] };
  }
  const headerRow = (matrix[0] ?? []).map(normalizeHeader).filter(Boolean);
  const headers = headerRow.length ? headerRow : [];
  const rows: Record<string, string>[] = [];
  for (const line of matrix.slice(1)) {
    if (!Array.isArray(line)) continue;
    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      const cell = normalizeCell(line[idx]);
      record[header] = cell;
      if (cell) hasValue = true;
    });
    if (hasValue) rows.push(record);
  }
  return { headers, rows };
}

function parseCsvText(text: string): ParsedSpreadsheet {
  const workbook = XLSX.read(text, { type: "string" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  return sheetToRows(workbook.Sheets[sheetName]!);
}

export function parseSpreadsheetBuffer(
  buffer: Buffer,
  filename: string
): ParsedSpreadsheet {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    return parseCsvText(buffer.toString("utf8"));
  }
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  return sheetToRows(workbook.Sheets[sheetName]!);
}

export function findPhoneColumn(headers: string[]): string | null {
  const normalized = headers.map((h) => ({
    raw: h,
    key: h
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, ""),
  }));
  const exact = normalized.find((h) => h.key === "telefone");
  return exact?.raw ?? null;
}
