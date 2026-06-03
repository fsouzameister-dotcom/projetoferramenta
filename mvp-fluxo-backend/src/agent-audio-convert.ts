import { mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

type ConvertResult = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  voice: boolean;
};

function resolveFfmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("ffmpeg-static") as string | null;
    if (typeof mod === "string" && mod.length > 0) return mod;
  } catch {
    /* optional */
  }
  const fromPath = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (fromPath.status === 0) return "ffmpeg";
  return null;
}

/** Converte WebM do navegador para OGG/OPUS (mensagem de voz na Meta). */
export function convertWebmToWhatsAppVoice(input: Buffer): ConvertResult | null {
  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg) return null;

  const dir = mkdtempSync(path.join(tmpdir(), "agent-audio-"));
  const inPath = path.join(dir, "in.webm");
  const outPath = path.join(dir, "out.ogg");
  try {
    writeFileSync(inPath, input);
    const r = spawnSync(
      ffmpeg,
      ["-y", "-i", inPath, "-c:a", "libopus", "-b:a", "32k", "-ac", "1", outPath],
      { timeout: 45_000 }
    );
    if (r.status !== 0) return null;
    const buffer = readFileSync(outPath);
    if (buffer.length === 0) return null;
    return { buffer, mimeType: "audio/ogg", fileName: "audio.ogg", voice: true };
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(inPath);
      unlinkSync(outPath);
    } catch {
      /* ignore */
    }
  }
}

/** Fallback: MP3 para áudio básico (sem ícone de voz). */
export function convertWebmToMp3(input: Buffer): ConvertResult | null {
  const ffmpeg = resolveFfmpegPath();
  if (!ffmpeg) return null;

  const dir = mkdtempSync(path.join(tmpdir(), "agent-audio-"));
  const inPath = path.join(dir, "in.webm");
  const outPath = path.join(dir, "out.mp3");
  try {
    writeFileSync(inPath, input);
    const r = spawnSync(
      ffmpeg,
      ["-y", "-i", inPath, "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1", outPath],
      { timeout: 45_000 }
    );
    if (r.status !== 0) return null;
    const buffer = readFileSync(outPath);
    if (buffer.length === 0) return null;
    return { buffer, mimeType: "audio/mpeg", fileName: "audio.mp3", voice: false };
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(inPath);
      unlinkSync(outPath);
    } catch {
      /* ignore */
    }
  }
}

/** Prepara buffer de áudio gravado no agente para envio WhatsApp. */
export function prepareOutboundAgentAudio(webmBuffer: Buffer): ConvertResult {
  const voice = convertWebmToWhatsAppVoice(webmBuffer);
  if (voice) return voice;
  const mp3 = convertWebmToMp3(webmBuffer);
  if (mp3) return mp3;
  return {
    buffer: webmBuffer,
    mimeType: "audio/webm",
    fileName: "audio.webm",
    voice: false,
  };
}
