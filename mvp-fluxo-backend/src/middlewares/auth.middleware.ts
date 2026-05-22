import { FastifyRequest, FastifyReply } from "fastify";
import * as jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config";
import { pool } from "../db";
import { isPlatformAdmin } from "../auth-roles";
import { ApiError, ERROR_CODES } from "../http";
import {
  assertCustomerTenantTarget,
  ensurePlatformTenantSchema,
} from "../tenant-platform";

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(
      401,
      ERROR_CODES.auth.AUTH_HEADER_INVALID,
      "Authorization token not provided or malformed"
    );
  }

  const token = authHeader.split(" ")[1];
  const headerTenantId = request.tenant?.id;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      tenant_id: string;
      role_id: string;
      role_name?: string;
      email: string;
    };

    const client = await pool.connect();
    try {
      const userResult = await client.query(
        `SELECT u.id, u.tenant_id, u.role_id, u.email, u.name, COALESCE(r.name, 'agente') AS role_name
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1 AND u.tenant_id = $2`,
        [decoded.id, decoded.tenant_id]
      );

      if (userResult.rows.length === 0) {
        throw new ApiError(
          401,
          ERROR_CODES.auth.USER_INVALID,
          "User not found or invalid"
        );
      }

      const row = userResult.rows[0];
      const homeTenantId = row.tenant_id as string;

      if (headerTenantId && headerTenantId !== homeTenantId) {
        if (!isPlatformAdmin(row.role_name)) {
          throw new ApiError(
            403,
            ERROR_CODES.auth.TOKEN_TENANT_MISMATCH,
            "Token does not match tenant in x-tenant-id"
          );
        }
        await ensurePlatformTenantSchema();
        try {
          await assertCustomerTenantTarget(headerTenantId);
        } catch {
          throw new ApiError(
            403,
            ERROR_CODES.platform.NOT_CUSTOMER_TENANT,
            "Acesso master permitido apenas a tenants de clientes"
          );
        }
        request.actingTenantId = headerTenantId;
      } else {
        request.actingTenantId = homeTenantId;
      }

      request.homeTenantId = homeTenantId;
      request.user = row;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new ApiError(
        401,
        ERROR_CODES.auth.TOKEN_INVALID,
        "Invalid or expired token"
      );
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      500,
      ERROR_CODES.auth.AUTH_MIDDLEWARE_ERROR,
      "Internal server error"
    );
  }
}
