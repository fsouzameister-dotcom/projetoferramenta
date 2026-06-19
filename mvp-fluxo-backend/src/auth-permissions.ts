/** Catálogo de permissões granulares da UI/API administrativa. */

import type { AppRole } from "./auth-roles";
import { isPlatformAdmin } from "./auth-roles";

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

/** Somente platform_admin — config técnica / multi-tenant. */
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

export const PERMISSION_CATALOG: PermissionMeta[] = [
  { key: "dashboard", label: "Painel", group: "Geral", description: "Visão geral e indicadores." },
  { key: "flows", label: "Fluxos", group: "Automação", description: "Listar, criar e editar fluxos." },
  { key: "users", label: "Usuários", group: "Acessos", description: "Gerenciar usuários do tenant." },
  { key: "roles", label: "Perfis e permissões", group: "Acessos", description: "Criar perfis e definir o que cada um acessa." },
  { key: "ai", label: "IA", group: "Inteligência", description: "Personas, scripts e provedores de IA." },
  {
    key: "whatsapp",
    label: "WhatsApp",
    group: "Plataforma",
    description: "Canais e credenciais WhatsApp (somente operador plataforma).",
  },
  {
    key: "inbound",
    label: "Entrada",
    group: "Plataforma",
    description: "Rotas de entrada e gatilhos (somente operador plataforma).",
  },
  { key: "campaigns", label: "Campanhas", group: "Automação", description: "Disparos em massa e relatórios." },
  { key: "monitoring", label: "Monitoramento", group: "Operacional", description: "Acompanhar conversas em tempo real." },
  { key: "operations", label: "Operação", group: "Operacional", description: "Filas, tabulações e configurações de atendimento." },
  { key: "reports", label: "Relatórios", group: "Operacional", description: "Relatórios e exportações." },
  {
    key: "platform_tenants",
    label: "Clientes (plataforma)",
    group: "Plataforma",
    description: "Gerenciar tenants de clientes.",
  },
];

export function getPermissionCatalog(roleName?: string): PermissionMeta[] {
  if (isPlatformAdmin(roleName)) return PERMISSION_CATALOG;
  return PERMISSION_CATALOG.filter((item) => !isPlatformOnlyPermission(item.key));
}

const PERMISSION_SET = new Set<string>(APP_PERMISSIONS);

export function isAppPermission(value: string): value is AppPermission {
  return PERMISSION_SET.has(value);
}

export function normalizePermissions(raw: unknown): AppPermission[] {
  if (!Array.isArray(raw)) return [];
  const out: AppPermission[] = [];
  for (const item of raw) {
    if (typeof item === "string" && isAppPermission(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  platform_admin: [...APP_PERMISSIONS],
  admin_local: APP_PERMISSIONS.filter(
    (p) => !isPlatformOnlyPermission(p)
  ),
  supervisor: ["dashboard", "flows", "monitoring", "operations", "reports"],
  agente: [],
};

export function defaultPermissionsForRole(roleName?: string): AppPermission[] {
  if (roleName && roleName in DEFAULT_ROLE_PERMISSIONS) {
    return [...DEFAULT_ROLE_PERMISSIONS[roleName as AppRole]];
  }
  return [];
}

export function resolveEffectivePermissions(input: {
  roleName?: string;
  storedPermissions?: unknown;
}): AppPermission[] {
  if (isPlatformAdmin(input.roleName)) {
    return [...APP_PERMISSIONS];
  }
  const stored = normalizePermissions(input.storedPermissions).filter(
    (p) => !isPlatformOnlyPermission(p)
  );
  if (stored.length > 0) {
    return stored;
  }
  return defaultPermissionsForRole(input.roleName);
}

export function hasPermission(
  permissions: AppPermission[] | undefined,
  permission: AppPermission,
  roleName?: string
): boolean {
  if (isPlatformAdmin(roleName)) return true;
  if (isPlatformOnlyPermission(permission)) return false;
  const effective =
    permissions && permissions.length > 0
      ? permissions
      : defaultPermissionsForRole(roleName);
  return effective.includes(permission);
}

export function hasAnyPermission(
  permissions: AppPermission[] | undefined,
  required: AppPermission[],
  roleName?: string
): boolean {
  if (isPlatformAdmin(roleName)) return true;
  return required.some((p) => hasPermission(permissions, p, roleName));
}

/** Qualquer permissão administrativa habilita acesso à área admin (exceto agente). */
export function hasAdminUiPermissions(
  permissions: AppPermission[] | undefined,
  roleName?: string
): boolean {
  if (isPlatformAdmin(roleName)) return true;
  if (roleName === "admin_local" || roleName === "supervisor" || roleName === "admin") {
    const effective = resolveEffectivePermissions({
      roleName,
      storedPermissions: permissions,
    });
    if (effective.length > 0) return true;
  }
  const effective = resolveEffectivePermissions({
    roleName,
    storedPermissions: permissions,
  });
  return effective.length > 0;
}

export function sanitizePermissionsInput(raw: unknown): AppPermission[] {
  return normalizePermissions(raw).filter((p) => !isPlatformOnlyPermission(p));
}
