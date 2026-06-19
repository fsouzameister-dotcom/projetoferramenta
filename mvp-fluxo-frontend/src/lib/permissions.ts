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

/** Somente platform_admin — espelha auth-permissions.ts do backend. */
export const PLATFORM_ONLY_PERMISSIONS: AppPermission[] = [
  "platform_tenants",
  "whatsapp",
  "inbound",
];

export function isPlatformOnlyPermission(permission: AppPermission): boolean {
  return PLATFORM_ONLY_PERMISSIONS.includes(permission);
}

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
  "/admin/insights": "reports",
  "/admin/whatsapp": "whatsapp",
  "/admin/inbound": "inbound",
  "/admin/campaigns": "campaigns",
  "/admin/monitoring": "monitoring",
  "/admin/operations": "operations",
  "/reports": "reports",
  "/faq": "dashboard",
  "/admin/platform/tenants": "platform_tenants",
};

const DEFAULT_ROLE_PERMISSIONS: Record<string, AppPermission[]> = {
  platform_admin: [...APP_PERMISSIONS],
  admin_local: APP_PERMISSIONS.filter((p) => !isPlatformOnlyPermission(p)),
  supervisor: ["dashboard", "flows", "monitoring", "operations", "reports"],
  admin: APP_PERMISSIONS.filter((p) => !isPlatformOnlyPermission(p)),
  agente: [],
};

export const ADMIN_LANDING_PATHS = [
  "/dashboard",
  "/flows",
  "/admin/users",
  "/admin/operations",
  "/reports",
  "/admin/monitoring",
  "/admin/campaigns",
  "/admin/ai",
  "/admin/roles",
  "/faq",
] as const;

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

export function getEffectivePermissions(): AppPermission[] {
  const role = localStorage.getItem("user_role") || "agente";
  if (role === "platform_admin") return [...APP_PERMISSIONS];
  const stored = getStoredPermissions().filter((p) => !isPlatformOnlyPermission(p));
  if (stored.length > 0) return stored;
  return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(permission: AppPermission): boolean {
  const role = localStorage.getItem("user_role") || "agente";
  if (role === "platform_admin") return true;
  if (isPlatformOnlyPermission(permission)) return false;
  return getEffectivePermissions().includes(permission);
}

export function hasAdminUiAccess(): boolean {
  const role = localStorage.getItem("user_role") || "agente";
  if (role === "platform_admin") return true;
  if (
    role === "admin_local" ||
    role === "supervisor" ||
    role === "admin"
  ) {
    return getEffectivePermissions().length > 0;
  }
  return getEffectivePermissions().length > 0;
}

export function getDefaultAdminLandingPath(): string {
  const role = localStorage.getItem("user_role") || "agente";
  if (role === "platform_admin") return "/admin/platform/tenants";
  for (const path of ADMIN_LANDING_PATHS) {
    if (canAccessPath(path)) return path;
  }
  return "/login";
}

export function canAccessPath(path: string): boolean {
  const role = localStorage.getItem("user_role") || "agente";
  if (role === "agente") return path === "/agent";
  if (role === "platform_admin") return true;
  if (path === "/admin/whatsapp" || path === "/admin/inbound" || path.startsWith("/admin/platform/")) {
    return false;
  }
  if (path === "/admin/insights") {
    return hasPermission("reports") || hasPermission("ai");
  }
  if (/^\/flows\/[^/]+$/.test(path)) return hasPermission("flows");
  const permission = ROUTE_PERMISSIONS[path];
  if (!permission) return hasAdminUiAccess();
  return hasPermission(permission);
}
