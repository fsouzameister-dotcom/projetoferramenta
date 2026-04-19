/**
 * Variáveis críticas — falha rápida no startup se ausentes.
 * Importar este módulo depois de `dotenv/config` no entrypoint.
 */
function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || String(v).trim() === "") {
    throw new Error(
      `Variável de ambiente obrigatória ausente ou vazia: ${name}`
    );
  }
  return String(v).trim();
}

export const JWT_SECRET = required("JWT_SECRET");

export const PG_HOST = required("PG_HOST");
export const PG_PORT = parseInt(process.env.PG_PORT || "5432", 10);
export const PG_USER = required("PG_USER");
export const PG_PASSWORD = required("PG_PASSWORD");
export const PG_DATABASE = required("PG_DATABASE");

/**
 * Produção: origem explícita obrigatória.
 * Desenvolvimento: se CORS_ORIGIN não vier definida, aceita qualquer porta em
 * localhost/127.0.0.1 (ex.: Vite cai em 5174 se 5173 estiver ocupada).
 */
export function getCorsOrigin(): string | RegExp {
  if (process.env.NODE_ENV === "production") {
    return required("CORS_ORIGIN");
  }
  const explicit = process.env.CORS_ORIGIN?.trim();
  if (explicit) {
    return explicit;
  }
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
}

export const REDIS_HOST =
  process.env.REDIS_HOST?.trim() || "127.0.0.1";
export const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

/**
 * Em desenvolvimento, login pode omitir tenantId no body se DEFAULT_LOGIN_TENANT_ID
 * estiver definido (ex.: após `npm run seed:dev`). Em produção, tenantId no body é obrigatório.
 */
export function resolveLoginTenantId(bodyTenantId?: string): string | null {
  const fromBody = bodyTenantId?.trim();
  if (fromBody) {
    return fromBody;
  }
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  const def = process.env.DEFAULT_LOGIN_TENANT_ID?.trim();
  return def || null;
}
