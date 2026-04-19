import { FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../db";

export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const tenantId = request.headers["x-tenant-id"] as string;

  if (!tenantId) {
    reply
      .code(400)
      .send({ message: "Tenant ID is required in x-tenant-id header" });
    return;
  }

  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id, name, plan, is_active, max_users, max_flows FROM tenants WHERE id = $1 AND is_active = TRUE`,
        [tenantId]
      );
      if (result.rows.length === 0) {
        reply.code(404).send({ message: "Tenant not found or inactive" });
        return;
      }

      request.tenant = result.rows[0];
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error in tenantMiddleware:", error);
    reply.code(500).send({ message: "Internal server error" });
  }
}
