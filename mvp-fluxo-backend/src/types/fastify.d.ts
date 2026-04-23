import 'fastify';

// Interface para o objeto Tenant que será injetado na requisição
interface Tenant {
  id: string;
  name: string;
  plan: string;
  is_active: boolean;
  max_users: number;
  max_flows: number;
}

// Interface para o objeto User que será injetado na requisição (após autenticação)
interface AuthenticatedUser {
  id: string;
  tenant_id: string;
  role_id: string;
  role_name?: string;
  email: string;
  name?: string;
  // Adicione outras propriedades do usuário que você queira acessar globalmente
}

// Estende a interface FastifyRequest para incluir as novas propriedades
declare module 'fastify' {
  interface FastifyRequest {
    tenant: Tenant;
    user?: AuthenticatedUser; // 'user' é opcional pois nem toda rota exige autenticação
  }
}