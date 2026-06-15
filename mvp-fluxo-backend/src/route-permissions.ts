import type { AppPermission } from "./auth-permissions";

/** Mapeia rotas da API para a permissão necessária. */
export function resolveRoutePermission(path: string): AppPermission | null {
  const normalized = path.split("?")[0].replace(/^\/api/, "") || "/";

  if (normalized.startsWith("/agent/")) return null;
  if (normalized === "/roles/assignable") return "users";
  if (normalized.startsWith("/roles")) return "roles";
  if (normalized.startsWith("/users")) return "users";
  if (normalized.startsWith("/flows") || normalized.startsWith("/nodes")) return "flows";
  if (normalized.startsWith("/ai")) return "ai";
  if (normalized.startsWith("/whatsapp")) return "whatsapp";
  if (normalized.startsWith("/inbound")) return "inbound";
  if (normalized.startsWith("/admin/campaigns")) return "campaigns";
  if (normalized.startsWith("/reports/campaigns")) return "campaigns";
  if (normalized.startsWith("/monitoring")) return "monitoring";
  if (
    normalized.startsWith("/queues") ||
    normalized.startsWith("/tabulacoes") ||
    normalized.startsWith("/service-settings") ||
    normalized.startsWith("/bot-safeguard") ||
    normalized.startsWith("/clients")
  ) {
    return "operations";
  }
  if (
    normalized.startsWith("/reports") ||
    normalized.includes("/flow-responses")
  ) {
    return "reports";
  }
  if (normalized.startsWith("/platform")) return "platform_tenants";
  if (normalized.startsWith("/dashboard")) return "dashboard";

  return null;
}
