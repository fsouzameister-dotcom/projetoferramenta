import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcrypt";

import {
  JWT_SECRET,
  getCorsOrigin,
  getWhatsAppAppSecret,
  getWhatsAppWebhookVerifyToken,
  resolveLoginTenantId,
  shouldSkipTwilioSignatureVerify,
  shouldSkipWhatsAppSignatureVerify,
} from "./config";
import { pool } from "./db";
import {
  ApiError,
  ERROR_CODES,
  errorEnvelopeSchema,
  sendError,
  sendSuccess,
  successEnvelopeSchema,
} from "./http";
import {
  recordInboundWhatsAppMessage,
  updateAgentMessageStatusByProvider,
} from "./agent-conversations";
import protectedRoutes from "./routes/protected.routes";
import { resolveTenantByTwilioWebhook, resolveTenantByWhatsAppPhoneNumberId } from "./whatsapp-channels";
import {
  parseWhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature,
} from "./whatsapp-cloud-api";
import { verifyTwilioWebhookSignature } from "./whatsapp-twilio-api";

export type BuildAppOptions = {
  /** Em testes, desliga logs ruidosos */
  logger?: boolean;
};

function publicUrlFromRequest(request: FastifyRequest): string {
  const xfProto = request.headers["x-forwarded-proto"];
  const proto =
    typeof xfProto === "string" ? xfProto.split(",")[0].trim() : "http";
  const host = request.headers.host ?? "localhost";
  return `${proto}://${host}${request.url}`;
}

function mapTwilioMessageStatus(
  raw: string | undefined
): "sending" | "sent" | "delivered" | "read" | "failed" | null {
  const s = (raw ?? "").toLowerCase();
  if (["queued", "accepted", "sending", "scheduled"].includes(s)) return "sending";
  if (s === "sent") return "sent";
  if (s === "delivered") return "delivered";
  if (s === "read") return "read";
  if (["undelivered", "failed", "canceled", "cancelled"].includes(s)) return "failed";
  return null;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  await app.register(cors, {
    origin: getCorsOrigin(),
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-tenant-id"],
  });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer", bodyLimit: 10 * 1024 * 1024 },
    function (request: FastifyRequest, body: Buffer, done) {
      try {
        (request as FastifyRequest & { rawBody?: Buffer }).rawBody = body;
        const json: unknown = JSON.parse(body.toString("utf8"));
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string", bodyLimit: 2 * 1024 * 1024 },
    function (request: FastifyRequest, body: string, done) {
      try {
        const url = request.url ?? "";
        if (!url.startsWith("/webhooks/twilio")) {
          return done(
            new Error("Content-Type application/x-www-form-urlencoded só é aceito em /webhooks/twilio"),
            undefined
          );
        }
        const params = new URLSearchParams(body);
        const obj: Record<string, string> = {};
        params.forEach((v, k) => {
          obj[k] = v;
        });
        done(null, obj);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

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

  app.get("/webhooks/whatsapp", async (request, reply) => {
    const verify = getWhatsAppWebhookVerifyToken();
    if (!verify) {
      return reply.code(503).send("Webhook verify token não configurado");
    }
    const q = request.query as Record<string, string | undefined>;
    if (
      q["hub.mode"] === "subscribe" &&
      q["hub.verify_token"] === verify &&
      typeof q["hub.challenge"] === "string"
    ) {
      return reply.code(200).send(q["hub.challenge"]);
    }
    return reply.code(403).send("Forbidden");
  });

  app.post("/webhooks/whatsapp", async (request, reply) => {
    const raw = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    const appSecret = getWhatsAppAppSecret();
    if (!shouldSkipWhatsAppSignatureVerify()) {
      if (!appSecret || !raw) {
        return reply.code(500).send({ ok: false });
      }
      const sig = request.headers["x-hub-signature-256"];
      const sigStr = typeof sig === "string" ? sig : undefined;
      if (!verifyWhatsAppWebhookSignature(raw, sigStr, appSecret)) {
        return reply.code(403).send({ ok: false });
      }
    }

    const events = parseWhatsAppWebhookPayload(request.body);
    for (const ev of events) {
      const resolved = await resolveTenantByWhatsAppPhoneNumberId(ev.phoneNumberId);
      if (!resolved) continue;

      if (ev.kind === "inbound_text") {
        const ts = ev.timestampSec
          ? new Date(ev.timestampSec * 1000).toISOString()
          : new Date().toISOString();
        await recordInboundWhatsAppMessage({
          tenantId: resolved.tenantId,
          providerMessageId: ev.messageId,
          fromWaId: ev.fromWaId,
          textBody: ev.textBody,
          contactName: ev.contactName,
          timestampIso: ts,
        });
      } else if (ev.kind === "status") {
        await updateAgentMessageStatusByProvider({
          tenantId: resolved.tenantId,
          providerMessageId: ev.messageId,
          deliveryStatus: ev.status,
          errorCode:
            ev.errors?.[0]?.code !== undefined ? String(ev.errors[0].code) : undefined,
          errorDescription: ev.errors?.[0]?.title ?? undefined,
        });
      }
    }

    return reply.code(200).send({ ok: true });
  });

  /** Mensagens recebidas (Twilio → "Quando uma mensagem chegar"). */
  app.post("/webhooks/twilio/messages", async (request, reply) => {
    const params = request.body as Record<string, string>;
    const accountSid = params.AccountSid?.trim();
    const to = params.To?.trim() ?? "";
    if (!accountSid || !to) {
      return reply.code(400).send({ ok: false });
    }

    const resolved = await resolveTenantByTwilioWebhook(accountSid, to);
    if (!resolved) {
      return reply.code(404).send({ ok: false });
    }

    const fullUrl = publicUrlFromRequest(request);
    const sig = request.headers["x-twilio-signature"];
    const sigStr = typeof sig === "string" ? sig : undefined;
    if (!shouldSkipTwilioSignatureVerify()) {
      if (
        !verifyTwilioWebhookSignature({
          authToken: resolved.authToken,
          fullUrl,
          params,
          signatureHeader: sigStr,
        })
      ) {
        return reply.code(403).send({ ok: false });
      }
    }

    const from = params.From?.trim();
    const messageSid = params.MessageSid?.trim();
    const body = params.Body ?? "";
    if (!from || !messageSid) {
      return reply.code(400).send({ ok: false });
    }
    if (!body.trim()) {
      return reply.code(200).send({ ok: true, skipped: true });
    }

    await recordInboundWhatsAppMessage({
      tenantId: resolved.tenantId,
      providerMessageId: messageSid,
      fromWaId: from.replace(/^whatsapp:/i, ""),
      textBody: body,
      contactName: undefined,
      timestampIso: new Date().toISOString(),
    });

    return reply.code(200).send({ ok: true });
  });

  /** Status de entrega (Twilio → URL de callback de status). */
  app.post("/webhooks/twilio/status", async (request, reply) => {
    const params = request.body as Record<string, string>;
    const accountSid = params.AccountSid?.trim();
    const messageSid = params.MessageSid?.trim();
    const statusRaw = params.MessageStatus ?? params.SmsStatus;
    if (!accountSid || !messageSid) {
      return reply.code(400).send({ ok: false });
    }

    const to = params.To?.trim() ?? "";
    const from = params.From?.trim() ?? "";
    let resolved =
      (to && (await resolveTenantByTwilioWebhook(accountSid, to))) ||
      (from && (await resolveTenantByTwilioWebhook(accountSid, from))) ||
      null;
    if (!resolved) {
      return reply.code(404).send({ ok: false });
    }

    const fullUrl = publicUrlFromRequest(request);
    const sig = request.headers["x-twilio-signature"];
    const sigStr = typeof sig === "string" ? sig : undefined;
    if (!shouldSkipTwilioSignatureVerify()) {
      if (
        !verifyTwilioWebhookSignature({
          authToken: resolved.authToken,
          fullUrl,
          params,
          signatureHeader: sigStr,
        })
      ) {
        return reply.code(403).send({ ok: false });
      }
    }

    const mapped = mapTwilioMessageStatus(statusRaw);
    if (!mapped) {
      return reply.code(200).send({ ok: true, ignored: true });
    }

    await updateAgentMessageStatusByProvider({
      tenantId: resolved.tenantId,
      providerMessageId: messageSid,
      deliveryStatus: mapped,
      errorCode: params.ErrorCode?.trim() || undefined,
      errorDescription: params.ErrorMessage?.trim() || undefined,
    });

    return reply.code(200).send({ ok: true });
  });

  await app.register(protectedRoutes, { prefix: "/api" });
  await app.ready();
  return app;
}
