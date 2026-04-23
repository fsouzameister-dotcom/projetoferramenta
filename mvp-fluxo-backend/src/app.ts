import Fastify from "fastify";
import cors from "@fastify/cors";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcrypt";

import { JWT_SECRET, getCorsOrigin, resolveLoginTenantId } from "./config";
import { pool } from "./db";
import {
  ApiError,
  ERROR_CODES,
  errorEnvelopeSchema,
  sendError,
  sendSuccess,
  successEnvelopeSchema,
} from "./http";
import { updateAgentMessageStatusByProvider } from "./agent-conversations";
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

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return sendError(
        request,
        reply,
        error.statusCode,
        error.code,
        error.message,
        error.details
      );
    }

    request.log.error(error);
    return sendError(
      request,
      reply,
      500,
      ERROR_CODES.common.INTERNAL_SERVER_ERROR,
      "Erro interno do servidor"
    );
  });

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["status"],
            properties: {
              status: { type: "string", enum: ["ok"] },
            },
          }),
        },
      },
    },
    async (request, reply) => {
      return sendSuccess(request, reply, { status: "ok" });
    }
  );

  app.post(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["email", "password"],
          properties: {
            email: { type: "string", minLength: 1 },
            password: { type: "string", minLength: 1 },
            tenantId: { type: "string", minLength: 1 },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["message", "token", "tenant_id", "role_name", "name"],
            properties: {
              message: { type: "string" },
              token: { type: "string" },
              tenant_id: { type: "string" },
              role_name: { type: "string" },
              name: { type: "string" },
            },
          }),
          400: errorEnvelopeSchema([
            ERROR_CODES.common.VALIDATION_ERROR,
            ERROR_CODES.tenant.TENANT_REQUIRED,
          ]),
          401: errorEnvelopeSchema([ERROR_CODES.auth.INVALID_CREDENTIALS]),
          500: errorEnvelopeSchema([
            ERROR_CODES.auth.LOGIN_FAILED,
            ERROR_CODES.common.INTERNAL_SERVER_ERROR,
          ]),
        },
      },
    },
    async (request, reply) => {
    const { email, password, tenantId: tenantFromBody } = request.body as {
      email?: string;
      password?: string;
      tenantId?: string;
    };

    if (!email || !password) {
      throw new ApiError(
        400,
        ERROR_CODES.common.VALIDATION_ERROR,
        "Email e senha são obrigatórios"
      );
    }

    const tenantId = resolveLoginTenantId(tenantFromBody);
    if (!tenantId) {
      throw new ApiError(
        400,
        ERROR_CODES.tenant.TENANT_REQUIRED,
        "tenantId é obrigatório em produção. Em desenvolvimento, defina DEFAULT_LOGIN_TENANT_ID no .env ou passe tenantId no body."
      );
    }

    let client;
    try {
      client = await pool.connect();
      const userResult = await client.query(
        `SELECT u.id, u.email, u.name, u.password_hash, u.tenant_id, u.role_id, COALESCE(r.name, 'agente') AS role_name
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.email = $1 AND u.tenant_id = $2`,
        [email, tenantId]
      );

      const user = userResult.rows[0];

      if (!user) {
        throw new ApiError(
          401,
          ERROR_CODES.auth.INVALID_CREDENTIALS,
          "Credenciais inválidas"
        );
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);

      if (!isPasswordValid) {
        throw new ApiError(
          401,
          ERROR_CODES.auth.INVALID_CREDENTIALS,
          "Credenciais inválidas"
        );
      }

      const token = jwt.sign(
        {
          id: user.id,
          tenant_id: user.tenant_id,
          role_id: user.role_id,
          role_name: user.role_name,
          email: user.email,
        },
        JWT_SECRET,
        { expiresIn: "24h" }
      );

      return sendSuccess(request, reply, {
        message: "Login successful",
        token,
        tenant_id: user.tenant_id,
        role_name: user.role_name,
        name: user.name ?? user.email,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      request.log.error(error);
      throw new ApiError(
        500,
        ERROR_CODES.auth.LOGIN_FAILED,
        "Falha ao processar login"
      );
    } finally {
      if (client) client.release();
    }
    }
  );

  app.post(
    "/webhooks/meta/status",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["tenantId", "providerMessageId", "delivery_status"],
          properties: {
            tenantId: { type: "string", minLength: 1 },
            providerMessageId: { type: "string", minLength: 1 },
            delivery_status: {
              type: "string",
              enum: ["sending", "sent", "delivered", "read", "failed"],
            },
            error_code: { type: "string" },
            error_description: { type: "string" },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: false,
            required: ["updated"],
            properties: {
              updated: { type: "boolean" },
            },
          }),
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        tenantId: string;
        providerMessageId: string;
        delivery_status: "sending" | "sent" | "delivered" | "read" | "failed";
        error_code?: string;
        error_description?: string;
      };

      const updated = await updateAgentMessageStatusByProvider({
        tenantId: body.tenantId,
        providerMessageId: body.providerMessageId,
        deliveryStatus: body.delivery_status,
        errorCode: body.error_code,
        errorDescription: body.error_description,
      });

      return sendSuccess(request, reply, { updated: Boolean(updated) });
    }
  );

  await app.register(protectedRoutes, { prefix: "/api" });
  await app.ready();
  return app;
}
