import archiver from "archiver";
import * as jwt from "jsonwebtoken";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Writable } from "node:stream";
import { resolveFfmpegPath } from "./agent-audio-convert";
import { JWT_SECRET } from "./config";
import { pool } from "./db";
import { buildTenantCallFilter, ensureTelephonySchema, type TenantCallFilter } from "./telephony";
import { VOICE_CALL_RESULT_LABELS, type VoiceCallResult } from "./telephony-rules";
import { buildVoiceCallsXlsx } from "./voice-call-export";

export const MAX_RECORDINGS_PER_ZIP = 2000;
const TOKEN_PURPOSE = "voice_recordings_zip";
const TOKEN_TTL_SECONDS = 10 * 60;
const TZ = "America/Sao_Paulo";

export function recordingsDir(): string {
  return process.env.VOICE_RECORDINGS_DIR?.trim() || "/var/spool/asterisk/monitor/clienton";
}

/** Arquivo da gravação (OGG convertido ou WAV ainda não convertido). */
export async function findRecordingFile(callId: string): Promise<{ file: string; ext: "ogg" | "wav"; size: number } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(callId)) return null;
  for (const ext of ["ogg", "wav"] as const) {
    const file = path.join(recordingsDir(), `${callId}.${ext}`);
    const info = await stat(file).catch(() => null);
    if (info?.isFile() && info.size > 0) return { file, ext, size: info.size };
  }
  return null;
}

function recordedFilter(filter: TenantCallFilter): TenantCallFilter {
  return { ...filter, onlyRecorded: true };
}

export async function summarizeRecordings(filter: TenantCallFilter): Promise<{ count: number; totalTalkSeconds: number }> {
  await ensureTelephonySchema();
  const { where, params } = buildTenantCallFilter(recordedFilter(filter));
  const result = await pool.query(
    `SELECT count(*)::int AS count, COALESCE(sum(c.talk_seconds), 0)::int AS talk FROM voice_calls c WHERE ${where}`,
    params
  );
  return { count: Number(result.rows[0]?.count ?? 0), totalTalkSeconds: Number(result.rows[0]?.talk ?? 0) };
}

export const RECORDING_FORMATS = ["ogg", "mp3", "wav"] as const;
export type RecordingFormat = (typeof RECORDING_FORMATS)[number];

export function parseRecordingFormat(value: unknown): RecordingFormat {
  return RECORDING_FORMATS.includes(value as RecordingFormat) ? (value as RecordingFormat) : "ogg";
}

type TokenPayload = { purpose: string; filter: TenantCallFilter; format?: RecordingFormat };

export function createRecordingsDownloadToken(filter: TenantCallFilter, format: RecordingFormat = "ogg"): string {
  const payload: TokenPayload = { purpose: TOKEN_PURPOSE, filter, format };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
}

export function verifyRecordingsDownloadToken(token: string): { filter: TenantCallFilter; format: RecordingFormat } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<TokenPayload>;
    if (decoded.purpose !== TOKEN_PURPOSE || !decoded.filter?.tenantId) return null;
    return { filter: decoded.filter, format: parseRecordingFormat(decoded.format) };
  } catch {
    return null;
  }
}

/** MP3 16 kHz/32 kbps e WAV PCM 8 kHz (qualidade de telefonia; a gravação original é narrowband). */
const FFMPEG_CODEC_ARGS: Record<Exclude<RecordingFormat, "ogg">, string[]> = {
  mp3: ["-ac", "1", "-ar", "16000", "-codec:a", "libmp3lame", "-b:a", "32k"],
  wav: ["-ac", "1", "-ar", "8000", "-codec:a", "pcm_s16le"],
};

function convertRecording(ffmpeg: string, input: string, output: string, format: Exclude<RecordingFormat, "ogg">): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpeg, ["-y", "-loglevel", "error", "-i", input, ...FFMPEG_CODEC_ARGS[format], output], {
      stdio: "ignore",
    });
    const timer = setTimeout(() => proc.kill("SIGKILL"), 120_000);
    proc.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

function slug(value: string, max = 40): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, max);
}

function stamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}_${get("hour")}-${get("minute")}-${get("second")}`;
}

export function recordingsZipFilename(filter: TenantCallFilter): string {
  const period = [filter.from, filter.to].filter(Boolean).join("_a_") || "todas";
  return `gravacoes-${period}.zip`;
}

/**
 * Monta o .zip em streaming: uma pasta por campanha ("manual" para as avulsas), áudios sem recompressão
 * (OGG já é compactado) e a planilha das ligações incluídas.
 */
export async function streamRecordingsZip(
  filter: TenantCallFilter,
  output: Writable,
  format: RecordingFormat = "ogg"
): Promise<void> {
  await ensureTelephonySchema();
  const { where, params } = buildTenantCallFilter(recordedFilter(filter));
  const result = await pool.query(
    `SELECT c.id, c.created_at, c.phone, c.result, c.talk_seconds, u.name AS user_name, vc.name AS campaign_name
     FROM voice_calls c
     LEFT JOIN users u ON u.id = c.user_id
     LEFT JOIN voice_campaigns vc ON vc.id = c.campaign_id
     WHERE ${where}
     ORDER BY c.created_at ASC
     LIMIT ${MAX_RECORDINGS_PER_ZIP}`,
    params
  );

  const archive = archiver("zip", { store: true });
  const done = new Promise<void>((resolve, reject) => {
    archive.on("error", reject);
    output.on("close", () => resolve());
    output.on("finish", () => resolve());
    output.on("error", reject);
  });
  archive.pipe(output);

  /** Resolve quando o archiver terminou de ler a entrada `name` (aí o arquivo temporário pode ser apagado). */
  const entryWritten = (name: string) =>
    new Promise<void>((resolve, reject) => {
      const onEntry = (entry: archiver.EntryData) => {
        if (entry.name !== name) return;
        archive.off("entry", onEntry);
        archive.off("error", onError);
        resolve();
      };
      const onError = (err: Error) => {
        archive.off("entry", onEntry);
        reject(err);
      };
      archive.on("entry", onEntry);
      archive.once("error", onError);
    });

  const ffmpeg = format === "ogg" ? null : resolveFfmpegPath();
  const workDir = ffmpeg ? await mkdtemp(path.join(tmpdir(), "voice-zip-")) : null;
  const missing: string[] = [];
  const conversionFailed: string[] = [];

  try {
    for (const row of result.rows) {
      const id = String(row.id);
      const found = await findRecordingFile(id);
      const created = row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at));
      const line = `${stamp(created)}  ${row.phone}  ${id}`;
      if (!found) {
        missing.push(line);
        continue;
      }
      const folder = row.campaign_name ? slug(String(row.campaign_name)) || "campanha" : "manual";
      const resultLabel = row.result ? VOICE_CALL_RESULT_LABELS[row.result as VoiceCallResult] ?? String(row.result) : "";
      const name = [
        stamp(created),
        String(row.phone),
        slug(String(row.user_name ?? ""), 24),
        slug(resultLabel, 20),
        id.slice(0, 8),
      ]
        .filter(Boolean)
        .join("_");

      if (ffmpeg && workDir && format !== "ogg" && found.ext !== format) {
        const converted = path.join(workDir, `${id}.${format}`);
        if (await convertRecording(ffmpeg, found.file, converted, format)) {
          const entryName = `${folder}/${name}.${format}`;
          const written = entryWritten(entryName);
          archive.file(converted, { name: entryName });
          await written;
          await rm(converted, { force: true }).catch(() => undefined);
          continue;
        }
        conversionFailed.push(line);
      }
      archive.file(found.file, { name: `${folder}/${name}.${found.ext}` });
    }
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }

  const { buffer } = await buildVoiceCallsXlsx(recordedFilter(filter));
  archive.append(buffer, { name: "ligacoes.xlsx" });
  if (missing.length) {
    archive.append(
      `Gravações não encontradas no servidor (ligação muito curta ou ainda em conversão):\n\n${missing.join("\n")}\n`,
      { name: "gravacoes-nao-encontradas.txt" }
    );
  }
  if (format !== "ogg" && (!ffmpeg || conversionFailed.length)) {
    archive.append(
      ffmpeg
        ? `Não foi possível converter para ${format.toUpperCase()}; estas seguem no formato original:\n\n${conversionFailed.join("\n")}\n`
        : "Conversor de áudio indisponível no servidor; as gravações seguem no formato original (OGG).\n",
      { name: "conversao-formato.txt" }
    );
  }
  await archive.finalize();
  await done;
}
