import { FastifyRequest, FastifyReply } from "fastify";
import * as jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config";
import { pool } from "../db";

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply
      .code(401)
      .send({ message: "Authorization token not provided or malformed" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      tenant_id: string;
      role_id: string;
      email: string;
    };

    const client = await pool.connect();
    try {
      const userResult = await client.query(
        `SELECT id, tenant_id, role_id, email FROM users WHERE id = $1 AND tenant_id = $2`,
        [decoded.id, decoded.tenant_id]
      );

      if (userResult.rows.length === 0) {
        reply.code(401).send({ message: "User not found or invalid" });
        return;
      }

      const row = userResult.rows[0];
      if (row.tenant_id !== request.tenant.id) {
        reply
          .code(403)
          .send({ message: "Token does not match tenant in x-tenant-id" });
        return;
      }

      request.user = row;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      reply.code(401).send({ message: "Invalid or expired token" });
    } else {
      console.error("Error in authMiddleware:", error);
      reply.code(500).send({ message: "Internal server error" });
    }
  }
}
