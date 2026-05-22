/** Chaves de sessão no localStorage. */

export function isSessionValid(): boolean {
  const token = localStorage.getItem("jwt_token");
  const tenantId = localStorage.getItem("tenant_id");
  if (!token || !tenantId) return false;

  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) return false;
    const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp) return false;
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function getHomeTenantId(): string {
  return (
    localStorage.getItem("home_tenant_id") ||
    localStorage.getItem("tenant_id") ||
    ""
  );
}

export function getActingTenantId(): string {
  return localStorage.getItem("tenant_id") || getHomeTenantId();
}

export function isImpersonating(): boolean {
  const home = getHomeTenantId();
  const acting = getActingTenantId();
  return Boolean(home && acting && home !== acting);
}

export function isPlatformAdmin(): boolean {
  return localStorage.getItem("user_role") === "platform_admin";
}

export function setActingTenant(tenantId: string, tenantName?: string) {
  localStorage.setItem("tenant_id", tenantId);
  if (tenantName) {
    localStorage.setItem("acting_tenant_name", tenantName);
  }
}

export function exitImpersonation() {
  const home = getHomeTenantId();
  if (home) {
    localStorage.setItem("tenant_id", home);
  }
  localStorage.removeItem("acting_tenant_name");
}

export function persistLoginSession(payload: {
  token: string;
  tenant_id: string;
  role_name?: string;
  name?: string;
  tenant_type?: string;
  is_platform_admin?: boolean;
}) {
  localStorage.setItem("jwt_token", payload.token);
  localStorage.setItem("tenant_id", payload.tenant_id);
  localStorage.setItem("home_tenant_id", payload.tenant_id);
  localStorage.setItem("user_role", payload.role_name || "agente");
  localStorage.setItem("user_name", payload.name || "");
  localStorage.setItem(
    "tenant_type",
    payload.tenant_type || (payload.is_platform_admin ? "platform" : "customer")
  );
  localStorage.removeItem("acting_tenant_name");
}

export function clearSession() {
  localStorage.removeItem("jwt_token");
  localStorage.removeItem("tenant_id");
  localStorage.removeItem("home_tenant_id");
  localStorage.removeItem("user_role");
  localStorage.removeItem("user_name");
  localStorage.removeItem("tenant_type");
  localStorage.removeItem("acting_tenant_name");
}

export function hasAdminUiAccess(): boolean {
  const role = localStorage.getItem("user_role") || "agente";
  return (
    role === "platform_admin" ||
    role === "admin_local" ||
    role === "supervisor" ||
    role === "admin"
  );
}
