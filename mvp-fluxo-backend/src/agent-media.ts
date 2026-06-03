import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AgentImagePayload = {
  url: string;
  fileName?: string;
  mimeType?: string;
  fileSizeKb?: number;
  caption?: string;
  /** Meta media id — permite renovar URL temporária */
  mediaId?: string;
};

export type AgentAudioPayload = {
  url: string;
  fileName?: string;
  mimeType?: string;
  fileSizeKb?: number;
  durationSec?: number;
  voice?: boolean;
  mediaId?: string;
};

export type AgentAttachmentPayload = {
  url: string;
  fileName: string;
  mimeType?: string;
  fileSizeKb?: number;
  caption?: string;
  mediaId?: string;
};

const MEDIA_DIR =
  process.env.AGENT_MEDIA_DIR?.trim() || path.join(process.cwd(), "uploads", "agent-media");

export function getAgentMediaDir(): string {
  return MEDIA_DIR;
}

export async function saveAgentMediaFile(input: {
  tenantId: string;
  buffer: Buffer;
  mimeType: string;
  extension: string;
}): Promise<{ token: string; filePath: string; publicPath: string }> {
  const token = randomUUID();
  const safeExt = input.extension.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  await mkdir(MEDIA_DIR, { recursive: true });
  const fileName = `${token}.${safeExt}`;
  const filePath = path.join(MEDIA_DIR, fileName);
  await writeFile(filePath, input.buffer);
  return {
    token,
    filePath,
    publicPath: `/api/agent/media/public/${token}.${safeExt}`,
  };
}

export async function readAgentMediaPublicFile(
  tokenWithExt: string
): Promise<{ buffer: Buffer; filePath: string } | null> {
  const safe = tokenWithExt.replace(/[^a-zA-Z0-9._-]/g, "");
  if (!safe || safe.includes("..")) return null;
  const filePath = path.join(MEDIA_DIR, safe);
  try {
    const buffer = await readFile(filePath);
    return { buffer, filePath };
  } catch {
    return null;
  }
}

export function mimeToExtension(mimeType: string, fileName?: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("webm")) return "webm";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("wordprocessingml")) return "docx";
  if (m.includes("msword")) return "doc";
  if (m.includes("spreadsheetml")) return "xlsx";
  if (m.includes("excel")) return "xls";
  if (m.includes("plain")) return "txt";
  const fromName = fileName?.split(".").pop()?.replace(/[^a-z0-9]/gi, "");
  if (fromName && fromName.length <= 8) return fromName.toLowerCase();
  return "bin";
}

export function mimeFromExtension(ext: string): string {
  const e = ext.toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    ogg: "audio/ogg",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    webm: "audio/webm",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
  };
  return map[e] ?? "application/octet-stream";
}

export function buildPublicMediaUrl(requestHost: string, token: string): string {
  const proto = process.env.PUBLIC_API_PROTO?.trim() || "https";
  return `${proto}://${requestHost}/api/agent/media/public/${token}`;
}
