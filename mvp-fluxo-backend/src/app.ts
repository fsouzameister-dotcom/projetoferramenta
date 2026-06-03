import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcrypt";

import { JWT_SECRET, getCorsOrigin, resolveLoginTenantId } from "./config";
import { pool } from "./db";
import { findUserByEmail } from "./tenant-platform";
import {
  ApiError,
  ERROR_CODES,
  errorEnvelopeSchema,
  sendError,
  sendSuccess,
  successEnvelopeSchema,
} from "./http";
import {
  recordInboundTwilioImage,
  recordInboundWhatsAppImage,
  updateAgentMessageStatusByProvider,
} from "./agent-conversations";
import { readAgentMediaPublicFile } from "./agent-media";
import { processInboundMessage } from "./inbound-orchestrator";
import {
  whatsAppMetaSourceKey,
  whatsAppTwilioSourceKey,
} from "./inbound-routes";
import {
  getInboundWebhookSecret,
  shouldSkipInboundWebhookSecret,
} from "./config";
import protectedRoutes from "./routes/protected.routes";
import { resolveTenantByTwilioWebhook, resolveTenantByWhatsAppPhoneNumberId } from "./whatsapp-channels";
import {
  parseWhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature,
} from "./whatsapp-cloud-api";
import { verifyTwilioWebhookSignature } from "./whatsapp-twilio-api";
import {
  resolveMetaAppSecret,
  resolveMetaWebhookVerifyToken,
  resolveShouldSkipTwilioSignatureVerify,
  resolveShouldSkipWhatsAppSignatureVerify,
} from "./server-whatsapp-settings";

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

/** TwiML mínimo; sem declaração XML (menos ruído com alguns parsers Twilio). */
const TWILIO_EMPTY_TWIML = "<Response/>";

/**
 * Webhook de mensagem recebida: a Twilio trata a resposta como TwiML.
 * Erros 4xx/5xx com corpo “estranho” ou sem Content-Type geram 12300/11200.
 * Estratégia: **sempre 200** + `text/xml` + TwiML vazio; falhas só em log.
 */
function twilioInboundAck(reply: FastifyReply) {
  return reply
    .code(200)
    .header("Content-Type", "text/xml; charset=utf-8")
    .send(TWILIO_EMPTY_TWIML);
}

/** Status callback: não é TwiML; Twilio aceita 200 + texto curto. */
function twilioStatusAck(reply: FastifyReply) {
  return reply.code(200).header("Content-Type", "text/plain; charset=utf-8").send("OK");
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
            required: [
              "message",
              "token",
              "tenant_id",
              "role_name",
              "name",
              "tenant_type",
              "is_platform_admin",
            ],
            properties: {
              message: { type: "string" },
              token: { type: "string" },
              tenant_id: { type: "string" },
              role_name: { type: "string" },
              name: { type: "string" },
              tenant_type: { type: "string" },
              is_platform_admin: { type: "boolean" },
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

    let client;
    try {
      client = await pool.connect();

      let user: {
        id: string;
        email: string;
        name: string;
        password_hash: string;
        tenant_id: string;
        role_id: string;
        role_name: string;
        tenant_type?: string;
      } | null = null;

      try {
        const byEmail = await findUserByEmail(email);
        if (byEmail) {
          user = byEmail;
        }
      } catch (lookupErr) {
        if (
          lookupErr instanceof Error &&
          lookupErr.message === "MULTIPLE_USERS_FOR_EMAIL"
        ) {
          throw new ApiError(
            500,
            ERROR_CODES.auth.LOGIN_FAILED,
            "E-mail associado a mais de uma conta; contate o suporte"
          );
        }
        throw lookupErr;
      }

      if (!user) {
        const tenantId = resolveLoginTenantId(tenantFromBody);
        if (!tenantId) {
          throw new ApiError(
            400,
            ERROR_CODES.tenant.TENANT_REQUIRED,
            "Credenciais inválidas ou tenantId ausente"
          );
        }
        const userResult = await client.query(
          `SELECT u.id, u.email, u.name, u.password_hash, u.tenant_id, u.role_id,
                  COALESCE(r.name, 'agente') AS role_name,
                  COALESCE(t.tenant_type, 'customer') AS tenant_type
           FROM users u
           LEFT JOIN roles r ON r.id = u.role_id
           JOIN tenants t ON t.id = u.tenant_id
           WHERE LOWER(u.email) = LOWER($1) AND u.tenant_id = $2`,
          [email, tenantId]
        );
        user = userResult.rows[0] ?? null;
      }

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

      const tenantType =
        (user.tenant_type as string | undefined) ?? "customer";
      const isPlatformAdmin = user.role_name === "platform_admin";

      return sendSuccess(request, reply, {
        message: "Login successful",
        token,
        tenant_id: user.tenant_id,
        role_name: user.role_name,
        name: user.name ?? user.email,
        tenant_type: tenantType,
        is_platform_admin: isPlatformAdmin,
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
    const verify = await resolveMetaWebhookVerifyToken();
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
    const appSecret = await resolveMetaAppSecret();
    if (!(await resolveShouldSkipWhatsAppSignatureVerify())) {
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
        await processInboundMessage({
          tenantId: resolved.tenantId,
          sourceType: "whatsapp_meta",
          sourceKey: whatsAppMetaSourceKey(ev.phoneNumberId),
          messageText: ev.textBody,
          phone: ev.fromWaId,
          contactName: ev.contactName,
          providerMessageId: ev.messageId,
          mirrorToAgentInbox: true,
        });
      } else if (ev.kind === "inbound_image") {
        const ts = ev.timestampSec
          ? new Date(ev.timestampSec * 1000).toISOString()
          : new Date().toISOString();
        await recordInboundWhatsAppImage({
          tenantId: resolved.tenantId,
          providerMessageId: ev.messageId,
          fromWaId: ev.fromWaId,
          mediaId: ev.mediaId,
          mimeType: ev.mimeType,
          caption: ev.caption,
          contactName: ev.contactName,
          timestampIso: ts,
          phoneNumberId: ev.phoneNumberId,
        });
      } else if (ev.kind === "status") {
        const failed = ev.status === "failed";
        const e0 = failed ? ev.errors?.[0] : undefined;
        const errorParts = failed
          ? [e0?.title, e0?.message, e0?.error_data?.details].filter(
              (x): x is string => typeof x === "string" && x.trim().length > 0
            )
          : [];
        await updateAgentMessageStatusByProvider({
          tenantId: resolved.tenantId,
          providerMessageId: ev.messageId,
          deliveryStatus: ev.status,
          errorCode:
            failed && e0?.code !== undefined ? String(e0.code) : undefined,
          errorDescription: errorParts.length ? errorParts.join(" — ") : undefined,
        });
      }
    }

    return reply.code(200).send({ ok: true });
  });

  /** Mensagens recebidas (Twilio → "Quando uma mensagem chegar"). */
  app.post("/webhooks/twilio/messages", async (request, reply) => {
    try {
      const params = request.body as Record<string, string>;
      const accountSid = params.AccountSid?.trim();
      const to = params.To?.trim() ?? "";
      if (!accountSid || !to) {
        request.log.warn({ msg: "twilio_messages_missing_account_or_to" });
        return twilioInboundAck(reply);
      }

      const resolved = await resolveTenantByTwilioWebhook(accountSid, to);
      if (!resolved) {
        request.log.warn({ msg: "twilio_messages_unknown_channel", accountSid, to });
        return twilioInboundAck(reply);
      }

      const fullUrl = publicUrlFromRequest(request);
      const sig = request.headers["x-twilio-signature"];
      const sigStr = typeof sig === "string" ? sig : undefined;
      if (!(await resolveShouldSkipTwilioSignatureVerify())) {
        if (
          !verifyTwilioWebhookSignature({
            authToken: resolved.authToken,
            fullUrl,
            params,
            signatureHeader: sigStr,
          })
        ) {
          request.log.warn({ msg: "twilio_messages_invalid_signature" });
          return twilioInboundAck(reply);
        }
      }

      const from = params.From?.trim();
      const messageSid = params.MessageSid?.trim();
      const body = params.Body ?? "";
      if (!from || !messageSid) {
        request.log.warn({ msg: "twilio_messages_missing_from_or_sid" });
        return twilioInboundAck(reply);
      }
      const numMedia = Number(params.NumMedia ?? "0");
      const mediaUrl0 = params.MediaUrl0?.trim();
      const mediaType0 = params.MediaContentType0?.trim();

      if (numMedia > 0 && mediaUrl0) {
        await recordInboundTwilioImage({
          tenantId: resolved.tenantId,
          providerMessageId: messageSid,
          fromWaId: from.replace(/^whatsapp:/i, ""),
          mediaUrl: mediaUrl0,
          mimeType: mediaType0,
          caption: body.trim() || undefined,
          contactName: undefined,
          timestampIso: new Date().toISOString(),
          accountSid,
          authToken: resolved.authToken,
        });
        return twilioInboundAck(reply);
      }

      if (!body.trim()) {
        return twilioInboundAck(reply);
      }

      await processInboundMessage({
        tenantId: resolved.tenantId,
        sourceType: "twilio_whatsapp",
        sourceKey: whatsAppTwilioSourceKey(accountSid, to),
        messageText: body,
        phone: from.replace(/^whatsapp:/i, ""),
        providerMessageId: messageSid,
        mirrorToAgentInbox: true,
      });

      return twilioInboundAck(reply);
    } catch (err) {
      request.log.error({ msg: "twilio_messages_handler_error", err });
      return twilioInboundAck(reply);
    }
  });

  /** Status de entrega (Twilio → URL de callback de status). */
  app.post("/webhooks/twilio/status", async (request, reply) => {
    try {
      const params = request.body as Record<string, string>;
      const accountSid = params.AccountSid?.trim();
      const messageSid = params.MessageSid?.trim();
      const statusRaw = params.MessageStatus ?? params.SmsStatus;
      if (!accountSid || !messageSid) {
        request.log.warn({ msg: "twilio_status_missing_fields" });
        return twilioStatusAck(reply);
      }

      const to = params.To?.trim() ?? "";
      const from = params.From?.trim() ?? "";
      let resolved =
        (to && (await resolveTenantByTwilioWebhook(accountSid, to))) ||
        (from && (await resolveTenantByTwilioWebhook(accountSid, from))) ||
        null;
      if (!resolved) {
        request.log.warn({ msg: "twilio_status_unknown_channel", accountSid, to, from });
        return twilioStatusAck(reply);
      }

      const fullUrl = publicUrlFromRequest(request);
      const sig = request.headers["x-twilio-signature"];
      const sigStr = typeof sig === "string" ? sig : undefined;
      if (!(await resolveShouldSkipTwilioSignatureVerify())) {
        if (
          !verifyTwilioWebhookSignature({
            authToken: resolved.authToken,
            fullUrl,
            params,
            signatureHeader: sigStr,
          })
        ) {
          request.log.warn({ msg: "twilio_status_invalid_signature" });
          return twilioStatusAck(reply);
        }
      }

      const mapped = mapTwilioMessageStatus(statusRaw);
      if (!mapped) {
        return twilioStatusAck(reply);
      }

      await updateAgentMessageStatusByProvider({
        tenantId: resolved.tenantId,
        providerMessageId: messageSid,
        deliveryStatus: mapped,
        errorCode: params.ErrorCode?.trim() || undefined,
        errorDescription: params.ErrorMessage?.trim() || undefined,
      });

      return twilioStatusAck(reply);
    } catch (err) {
      request.log.error({ msg: "twilio_status_handler_error", err });
      return twilioStatusAck(reply);
    }
  });

  app.post(
    "/webhooks/inbound",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["sourceType", "sourceKey", "message"],
          properties: {
            sourceType: { type: "string", minLength: 1 },
            sourceKey: { type: "string", minLength: 1 },
            message: { type: "string", minLength: 1 },
            phone: { type: "string" },
            email: { type: "string" },
            name: { type: "string" },
            sessionId: { type: "string" },
            metadata: { type: "object", additionalProperties: true },
          },
        },
        response: {
          200: successEnvelopeSchema({
            type: "object",
            additionalProperties: true,
            properties: {
              routed: { type: "boolean" },
              flowId: { type: "string" },
              status: { type: "string" },
              resumed: { type: "boolean" },
            },
          }),
          401: errorEnvelopeSchema([ERROR_CODES.auth.INVALID_CREDENTIALS]),
          400: errorEnvelopeSchema([ERROR_CODES.tenant.TENANT_REQUIRED]),
        },
      },
    },
    async (request, reply) => {
      const secret = getInboundWebhookSecret();
      if (!shouldSkipInboundWebhookSecret()) {
        const headerSecret = request.headers["x-inbound-secret"];
        const provided =
          typeof headerSecret === "string" ? headerSecret.trim() : "";
        if (!secret || provided !== secret) {
          return sendError(
            request,
            reply,
            401,
            ERROR_CODES.auth.INVALID_CREDENTIALS,
            "Segredo de webhook inválido"
          );
        }
      }

      const tenantHeader = request.headers["x-tenant-id"];
      const tenantId =
        typeof tenantHeader === "string" ? tenantHeader.trim() : "";
      if (!tenantId) {
        return sendError(
          request,
          reply,
          400,
          ERROR_CODES.tenant.TENANT_REQUIRED,
          "Header x-tenant-id é obrigatório"
        );
      }

      const body = request.body as {
        sourceType: string;
        sourceKey: string;
        message: string;
        phone?: string;
        email?: string;
        name?: string;
        sessionId?: string;
        metadata?: Record<string, unknown>;
      };

      const result = await processInboundMessage({
        tenantId,
        sourceType: body.sourceType,
        sourceKey: body.sourceKey,
        messageText: body.message,
        phone: body.phone,
        email: body.email,
        contactName: body.name,
        metadata: {
          ...(body.metadata ?? {}),
          ...(body.sessionId ? { sessionId: body.sessionId } : {}),
        },
      });

      return sendSuccess(request, reply, result);
    }
  );

  app.get<{ Params: { mediaKey: string } }>(
    "/api/agent/media/public/:mediaKey",
    async (request, reply) => {
    const file = await readAgentMediaPublicFile(request.params.mediaKey);
    if (!file) {
      return reply.code(404).send("Not found");
    }
    const ext = request.params.mediaKey.split(".").pop()?.toLowerCase() ?? "jpg";
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "gif"
          ? "image/gif"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg";
    return reply
      .header("Cache-Control", "public, max-age=86400")
      .type(mime)
      .send(file.buffer);
    }
  );

  await app.register(protectedRoutes, { prefix: "/api" });
  await app.ready();
  return app;
}
