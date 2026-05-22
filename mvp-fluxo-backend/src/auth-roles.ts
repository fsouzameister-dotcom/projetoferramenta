/** Papéis reconhecidos na API e regras de acesso administrativo. */

export type AppRole =
  | "platform_admin"
  | "admin_local"
  | "supervisor"
  | "agente";

export const CUSTOMER_ROLES: AppRole[] = [
  "admin_local",
  "supervisor",
  "agente",
];

export const PLATFORM_ROLES: AppRole[] = [
  "platform_admin",
  "admin_local",
  "supervisor",
  "agente",
];

export function isPlatformAdmin(role?: string): boolean {
  return role === "platform_admin";
}

/** Admin da UI: gestão, relatórios, IA, WhatsApp (inclui platform_admin em qualquer tenant ativo). */
export function hasAdminAccess(role?: string): boolean {
  return (
    role === "platform_admin" ||
    role === "admin_local" ||
    role === "supervisor" ||
    role === "admin"
  );
}

export function isAllowedRole(role: string): role is AppRole {
  return (
    role === "platform_admin" ||
    role === "admin_local" ||
    role === "supervisor" ||
    role === "agente"
  );
}

export function isAllowedRoleForTenant(
  role: string,
  tenantType: "platform" | "customer"
): role is AppRole {
  if (!isAllowedRole(role)) return false;
  if (tenantType === "platform") {
    return PLATFORM_ROLES.includes(role);
  }
  return CUSTOMER_ROLES.includes(role);
}
