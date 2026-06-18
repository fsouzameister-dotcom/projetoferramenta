export const TENANT_SLUG_MIN_LENGTH = 2;
export const TENANT_SLUG_MAX_LENGTH = 48;

export type TenantSlugIssue = "INVALID_SLUG" | "SLUG_ALREADY_EXISTS";

export function normalizeTenantSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, TENANT_SLUG_MAX_LENGTH);
}

export function slugifyTenantName(name: string): string {
  return normalizeTenantSlug(name);
}

export function getTenantSlugIssue(slug: string): TenantSlugIssue | null {
  const normalized = normalizeTenantSlug(slug);
  if (normalized.length < TENANT_SLUG_MIN_LENGTH) {
    return "INVALID_SLUG";
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return "INVALID_SLUG";
  }
  return null;
}
