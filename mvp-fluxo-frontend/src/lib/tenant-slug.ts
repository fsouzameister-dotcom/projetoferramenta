export const TENANT_SLUG_MIN_LENGTH = 2;
export const TENANT_SLUG_MAX_LENGTH = 48;

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

export function getTenantSlugClientError(slug: string): string | null {
  const normalized = normalizeTenantSlug(slug);
  if (normalized.length < TENANT_SLUG_MIN_LENGTH) {
    return "O slug precisa ter pelo menos 2 caracteres válidos (letras, números e hífens).";
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return "Use apenas letras minúsculas, números e hífens.";
  }
  return null;
}
