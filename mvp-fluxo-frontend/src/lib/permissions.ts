export const APP_PERMISSIONS = [
  "dashboard",
  "flows",
  "users",
  "roles",
  "ai",
  "whatsapp",
  "inbound",
  "campaigns",
  "monitoring",
  "operations",
  "reports",
  "platform_tenants",
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

export type PermissionMeta = {
  key: AppPermission;
  label: string;
  group: string;
  description: string;
};

export const ROUTE_PERMISSIONS: Record<string, AppPermission> = {
  "/dashboard": "dashboard",
  "/flows": "flows",
  "/flows/new": "flows",
  "/admin/users": "users",
  "/admin/roles": "roles",
  "/admin/ai": "ai",
  "/admin/whatsapp": "whatsapp",
  "/admin/inbound": "inbound",
  "/admin/campaigns": "campaigns",
  "/admin/monitoring": "monitoring",
  "/admin/operations": "operations",
  "/reports": "reports",
  "/faq": "dashboard",
  "/admin/platform/tenants": "platform_tenants",
};

export function getStoredPermissions(): AppPermission[] {
  try {
    const raw = localStorage.getItem("user_permissions");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is AppPermission =>
      typeof p === "string" && (APP_PERMISSIONS as readonly string[]).includes(p)
    );
  } catch {
    return [];
  }
}

export function hasPermission(permission: AppPermission): boolean {
  const role = localStorage.getItem("user_role") || "agente";
  if (role === "platform_admin") return true;
  return getStoredPermissions().includes(permission);
}

export function hasAdminUiAccess(): boolean {
  const role = localStorage.getItem("user_role") || "agente";
  if (role === "platform_admin" || role === "admin_local" || role === "supervisor" || role === "admin") {
    const perms = getStoredPermissions();
    if (perms.length > 0) return true;
  }
  return getStoredPermissions().length > 0;
}

export function canAccessPath(path: string): boolean {
  const role = localStorage.getItem("user_role") || "agente";
  if (role === "agente") return path === "/agent";
  if (role === "platform_admin") return true;
  if (/^\/flows\/[^/]+$/.test(path)) return hasPermission("flows");
  const permission = ROUTE_PERMISSIONS[path];
  if (!permission) return hasAdminUiAccess();
  return hasPermission(permission);
}
