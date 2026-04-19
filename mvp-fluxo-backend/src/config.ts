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

/** Produção exige origem explícita; em dev usa localhost do Vite por padrão. */
export function getCorsOrigin(): string {
  if (process.env.NODE_ENV === "production") {
    return required("CORS_ORIGIN");
  }
  return process.env.CORS_ORIGIN?.trim() || "http://localhost:5173";
}

export const REDIS_HOST =
  process.env.REDIS_HOST?.trim() || "127.0.0.1";
export const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
