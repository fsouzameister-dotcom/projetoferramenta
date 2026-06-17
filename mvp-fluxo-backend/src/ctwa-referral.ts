/** Click-to-WhatsApp (CTWA) — metadados do anúncio Meta na primeira mensagem. */

export type CtwaReferral = {
  sourceType: string;
  sourceId: string | null;
  sourceUrl: string | null;
  headline: string | null;
  body: string | null;
  mediaType: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  ctwaClid: string | null;
  capturedAt: string;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function parseCtwaReferral(raw: unknown): CtwaReferral | null {
  if (!raw || typeof raw !== "object") return null;
  const ref = raw as Record<string, unknown>;
  const sourceType = readString(ref.source_type) ?? "ad";
  const hasSignal =
    readString(ref.source_id) ||
    readString(ref.ctwa_clid) ||
    readString(ref.source_url) ||
    readString(ref.headline);
  if (!hasSignal) return null;

  return {
    sourceType,
    sourceId: readString(ref.source_id),
    sourceUrl: readString(ref.source_url),
    headline: readString(ref.headline),
    body: readString(ref.body),
    mediaType: readString(ref.media_type),
    imageUrl: readString(ref.image_url),
    videoUrl: readString(ref.video_url),
    thumbnailUrl: readString(ref.thumbnail_url),
    ctwaClid: readString(ref.ctwa_clid),
    capturedAt: new Date().toISOString(),
  };
}

/** Chave de rota em Admin → Entrada (tipo CTWA). */
export function buildCtwaSourceKey(referral: CtwaReferral): string {
  if (referral.sourceId) return `ad_${referral.sourceId}`;
  if (referral.ctwaClid) return `clid_${referral.ctwaClid}`;
  return "default";
}

export function ctwaReferralForMetadata(referral: CtwaReferral): Record<string, unknown> {
  return {
    source_type: referral.sourceType,
    source_id: referral.sourceId,
    source_url: referral.sourceUrl,
    headline: referral.headline,
    body: referral.body,
    media_type: referral.mediaType,
    image_url: referral.imageUrl,
    video_url: referral.videoUrl,
    thumbnail_url: referral.thumbnailUrl,
    ctwa_clid: referral.ctwaClid,
    captured_at: referral.capturedAt,
  };
}
