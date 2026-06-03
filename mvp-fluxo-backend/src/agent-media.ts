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

export function mimeToExtension(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

export function buildPublicMediaUrl(requestHost: string, token: string): string {
  const proto = process.env.PUBLIC_API_PROTO?.trim() || "https";
  return `${proto}://${requestHost}/api/agent/media/public/${token}`;
}
