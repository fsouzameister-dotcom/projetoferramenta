import { isPlatformAdmin } from "~lib/session";
import { hasPermission, type AppPermission } from "~lib/permissions";

export type SidebarNavItem = {
  label: string;
  path: string;
  icon: string;
  permission?: AppPermission;
  /** Visibilidade extra (ex.: Insights = reports ou ai). */
  isVisible?: () => boolean;
};

export type SidebarNavGroup = {
  id: string;
  label: string;
  icon: string;
  /** Somente platform_admin (ex.: Plataforma). */
  platformOnly?: boolean;
  children: SidebarNavItem[];
};

export const SIDEBAR_STANDALONE: SidebarNavItem[] = [
  { label: "Painel", path: "/dashboard", icon: "⊞", permission: "dashboard" },
];

export const SIDEBAR_GROUPS: SidebarNavGroup[] = [
  {
    id: "platform",
    label: "Plataforma",
    icon: "🏢",
    platformOnly: true,
    children: [
      {
        label: "Clientes",
        path: "/admin/platform/tenants",
        icon: "🏢",
        permission: "platform_tenants",
      },
      {
        label: "WhatsApp",
        path: "/admin/whatsapp",
        icon: "💬",
        permission: "whatsapp",
      },
      {
        label: "Entrada",
        path: "/admin/inbound",
        icon: "📥",
        permission: "inbound",
      },
    ],
  },
  {
    id: "automacao",
    label: "Automação",
    icon: "⬡",
    children: [
      { label: "Fluxos", path: "/flows", icon: "⬡", permission: "flows" },
      {
        label: "Campanhas",
        path: "/admin/campaigns",
        icon: "📣",
        permission: "campaigns",
      },
    ],
  },
  {
    id: "operacional",
    label: "Operacional",
    icon: "📡",
    children: [
      {
        label: "Monitoramento",
        path: "/admin/monitoring",
        icon: "📡",
        permission: "monitoring",
      },
      {
        label: "Operação",
        path: "/admin/operations",
        icon: "⚙️",
        permission: "operations",
      },
      {
        label: "Relatórios",
        path: "/reports",
        icon: "📊",
        permission: "reports",
      },
    ],
  },
  {
    id: "inteligencia",
    label: "Inteligência",
    icon: "🤖",
    children: [
      { label: "IA", path: "/admin/ai", icon: "🤖", permission: "ai" },
      {
        label: "Insights IA",
        path: "/admin/insights",
        icon: "✨",
        isVisible: () => hasPermission("reports") || hasPermission("ai"),
      },
    ],
  },
  {
    id: "acessos",
    label: "Acessos",
    icon: "👥",
    children: [
      { label: "Usuários", path: "/admin/users", icon: "👤", permission: "users" },
      { label: "Perfis", path: "/admin/roles", icon: "🛡️", permission: "roles" },
    ],
  },
];

export const SIDEBAR_FOOTER: SidebarNavItem = {
  label: "FAQ",
  path: "/faq",
  icon: "❓",
  permission: "dashboard",
};

function isNavItemVisible(item: SidebarNavItem): boolean {
  if (item.isVisible) return item.isVisible();
  if (!item.permission) return true;
  return hasPermission(item.permission);
}

export function filterVisibleNavItems(items: SidebarNavItem[]): SidebarNavItem[] {
  return items.filter(isNavItemVisible);
}

export function filterVisibleNavGroups(groups: SidebarNavGroup[]): SidebarNavGroup[] {
  return groups
    .filter((group) => {
      if (group.platformOnly && !isPlatformAdmin()) return false;
      return filterVisibleNavItems(group.children).length > 0;
    })
    .map((group) => ({
      ...group,
      children: filterVisibleNavItems(group.children),
    }));
}

export function isPathActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === "/flows") {
    return (
      currentPath === "/flows" ||
      currentPath.startsWith("/flows/") ||
      /^\/flows\/edit\//.test(currentPath)
    );
  }
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

export function groupContainsActivePath(
  group: SidebarNavGroup,
  currentPath: string
): boolean {
  return group.children.some((child) => isPathActive(currentPath, child.path));
}
