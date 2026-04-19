import Fastify from "fastify";
import cors from "@fastify/cors";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcrypt";

import { JWT_SECRET, getCorsOrigin } from "./config";
import { pool } from "./db";
import protectedRoutes from "./routes/protected.routes";

export type BuildAppOptions = {
  /** Em testes, desliga logs ruidosos */
  logger?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  await app.register(cors, {
    origin: getCorsOrigin(),
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-tenant-id"],
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.post("/login", async (request, reply) => {
    const { email, password, tenantId } = request.body as {
      email?: string;
      password?: string;
      tenantId?: string;
    };

    if (!email || !password || !tenantId) {
      reply
        .code(400)
        .send({ message: "Email, password, and tenantId are required" });
      return;
    }

    let client;
    try {
      client = await pool.connect();
      const userResult = await client.query(
        `SELECT id, email, password_hash, tenant_id, role_id FROM users WHERE email = $1 AND tenant_id = $2`,
        [email, tenantId]
      );

      const user = userResult.rows[0];

      if (!user) {
        reply.code(401).send({ message: "Invalid credentials" });
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        reply.code(401).send({ message: "Invalid credentials" });
        return;
      }

      const token = jwt.sign(
        {
          id: user.id,
          tenant_id: user.tenant_id,
          role_id: user.role_id,
          email: user.email,
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      return reply.send({ message: "Login successful", token });
    } catch (error) {
      console.error("Error during login:", error);
      reply.code(500).send({ message: "Internal server error" });
    } finally {
      if (client) client.release();
    }
  });

  await app.register(protectedRoutes, { prefix: "/api" });
  await app.ready();
  return app;
}
