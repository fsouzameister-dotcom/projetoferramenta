import { FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../db";
import { ApiError, ERROR_CODES } from "../http";

export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const tenantId = request.headers["x-tenant-id"] as string;

  if (!tenantId) {
    throw new ApiError(
      400,
      ERROR_CODES.tenant.TENANT_HEADER_REQUIRED,
      "Tenant ID is required in x-tenant-id header"
    );
  }

  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id, name, plan, is_active, max_users, max_flows FROM tenants WHERE id = $1 AND is_active = TRUE`,
        [tenantId]
      );
      if (result.rows.length === 0) {
        throw new ApiError(
          404,
          ERROR_CODES.tenant.TENANT_NOT_FOUND,
          "Tenant not found or inactive"
        );
      }

      request.tenant = result.rows[0];
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      500,
      ERROR_CODES.tenant.TENANT_MIDDLEWARE_ERROR,
      "Internal server error"
    );
  }
}
