import type { FastifyRequest } from "fastify";
import {
  type AppPermission,
  hasAnyPermission,
  hasPermission,
  hasAdminUiPermissions,
} from "./auth-permissions";
import { ApiError, ERROR_CODES } from "./http";

export function requirePermission(
  request: FastifyRequest,
  permission: AppPermission
): void {
  const user = request.user;
  if (!hasPermission(user?.permissions, permission, user?.role_name)) {
    throw new ApiError(
      403,
      ERROR_CODES.users.FORBIDDEN_PERMISSION,
      `Permissão necessária: ${permission}`
    );
  }
}

export function requireAnyPermission(
  request: FastifyRequest,
  permissions: AppPermission[]
): void {
  const user = request.user;
  if (!hasAnyPermission(user?.permissions, permissions, user?.role_name)) {
    throw new ApiError(
      403,
      ERROR_CODES.users.FORBIDDEN_PERMISSION,
      "Você não tem permissão para executar esta ação"
    );
  }
}

/** Substitui o antigo ensureAdminAccess com checagem por permissões efetivas. */
export function requireAdminAccess(request: FastifyRequest): void {
  const user = request.user;
  if (!hasAdminUiPermissions(user?.permissions, user?.role_name)) {
    throw new ApiError(
      403,
      ERROR_CODES.users.FORBIDDEN_ROLE,
      "Apenas administradores podem executar esta ação"
    );
  }
}
