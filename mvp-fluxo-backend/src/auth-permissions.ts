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

export type PermissionMeta = {
  key: AppPermission;
  label: string;
  group: string;
  description: string;
};

export const PERMISSION_CATALOG: PermissionMeta[] = [
  { key: "dashboard", label: "Painel", group: "Geral", description: "Visão geral e indicadores." },
  { key: "flows", label: "Fluxos", group: "Automação", description: "Listar, criar e editar fluxos." },
  { key: "users", label: "Usuários", group: "Administração", description: "Gerenciar usuários do tenant." },
  { key: "roles", label: "Perfis e permissões", group: "Administração", description: "Criar perfis e definir o que cada um acessa." },
  { key: "ai", label: "IA", group: "Canais", description: "Personas, scripts e provedores de IA." },
  { key: "whatsapp", label: "WhatsApp", group: "Canais", description: "Canais e templates WhatsApp." },
  { key: "inbound", label: "Entrada", group: "Canais", description: "Rotas de entrada e gatilhos." },
  { key: "campaigns", label: "Campanhas", group: "Canais", description: "Disparos em massa e relatórios." },
  { key: "monitoring", label: "Monitoramento", group: "Operação", description: "Acompanhar conversas em tempo real." },
  { key: "operations", label: "Operação", group: "Operação", description: "Filas, tabulações e configurações de atendimento." },
  { key: "reports", label: "Relatórios", group: "Operação", description: "Relatórios e exportações." },
  { key: "platform_tenants", label: "Clientes (plataforma)", group: "Plataforma", description: "Gerenciar tenants de clientes." },
];

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
  admin_local: APP_PERMISSIONS.filter((p) => p !== "platform_tenants"),
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
  const stored = normalizePermissions(input.storedPermissions);
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
  return normalizePermissions(raw);
}
