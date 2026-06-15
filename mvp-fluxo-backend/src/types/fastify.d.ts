import 'fastify';
import type { AppPermission } from '../auth-permissions';

// Interface para o objeto Tenant que será injetado na requisição
interface Tenant {
  id: string;
  name: string;
  plan: string;
  is_active: boolean;
  max_users: number;
  max_flows: number;
  tenant_type?: string;
  segment?: string | null;
}

// Interface para o objeto User que será injetado na requisição (após autenticação)
interface AuthenticatedUser {
  id: string;
  tenant_id: string;
  role_id: string;
  role_name?: string;
  email: string;
  name?: string;
  permissions?: AppPermission[];
}

// Estende a interface FastifyRequest para incluir as novas propriedades
declare module 'fastify' {
  interface FastifyRequest {
    tenant: Tenant;
    user?: AuthenticatedUser;
    /** Tenant do JWT (casa do usuário). */
    homeTenantId?: string;
    /** Tenant efetivo da requisição (igual a tenant.id; útil para platform_admin). */
    actingTenantId?: string;
  }
}