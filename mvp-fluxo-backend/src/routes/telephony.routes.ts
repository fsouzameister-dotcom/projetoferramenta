import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { getTelephonyConfig } from "../config";
import { ApiError, ERROR_CODES, sendSuccess } from "../http";
import {
  abandonRequestedCall,
  authorizeCallFromAsterisk,
  createTelephonySession,
  finishCallFromAsterisk,
  isTelephonyEnabledForUser,
  listAgentRecentCalls,
  listTabulacoesForCall,
  listTelephonyUsers,
  listTenantCalls,
  requestOutboundCall,
  setTelephonyUserEnabled,
  tabulateCall,
} from "../telephony";

function mapTelephonyError(err: unknown): never {
  const code = err instanceof Error ? err.message : "";
  const t = ERROR_CODES.telephony;
  if (code === "TELEPHONY_NOT_CONFIGURED") {
    throw new ApiError(503, t.TELEPHONY_NOT_CONFIGURED, "Telefonia não configurada no servidor");
  }
  if (code === "TELEPHONY_NOT_ENABLED") {
    throw new ApiError(403, t.TELEPHONY_NOT_ENABLED, "Ligações não liberadas para este usuário");
  }
  if (code === "TELEPHONY_INVALID_PHONE") {
    throw new ApiError(400, t.TELEPHONY_INVALID_PHONE, "Número inválido. Use DDD + número (celular ou fixo do Brasil)");
  }
  if (code === "TELEPHONY_CALL_IN_PROGRESS") {
    throw new ApiError(409, t.TELEPHONY_CALL_IN_PROGRESS, "Já existe uma ligação em andamento");
  }
  if (code === "TELEPHONY_TOO_FAST") {
    throw new ApiError(429, t.TELEPHONY_TOO_FAST, "Aguarde alguns segundos antes de nova ligação");
  }
  if (code === "TELEPHONY_CALL_NOT_FOUND") {
    throw new ApiError(404, t.TELEPHONY_CALL_NOT_FOUND, "Ligação não encontrada");
  }
  if (code === "TELEPHONY_USER_NOT_FOUND") {
    throw new ApiError(404, t.TELEPHONY_USER_NOT_FOUND, "Usuário não encontrado");
  }
  if (code === "TELEPHONY_PROVISION_FAILED") {
    throw new ApiError(502, t.TELEPHONY_PROVISION_FAILED, "Não foi possível preparar o ramal. Tente novamente");
  }
  if (code === "TELEPHONY_TABULACAO_NOT_ALLOWED") {
    throw new ApiError(400, t.TELEPHONY_TABULACAO_NOT_ALLOWED, "Tabulação não permitida");
  }
  throw err;
}

function currentUserId(request: FastifyRequest): string {
  const id = request.user?.id;
  if (!id) throw new ApiError(401, ERROR_CODES.auth.USER_INVALID, "Usuário inválido");
  return id;
}

/** Rotas autenticadas (montadas dentro de /api). */
const telephonyRoutes: FastifyPluginAsync = async (fastify) => {
  // --- Atendente ----------------------------------------------------------
  fastify.get("/agent/telephony/status", async (request, reply) => {
    const configured = getTelephonyConfig() !== null;
    const enabled = configured && (await isTelephonyEnabledForUser(request.tenant.id, currentUserId(request)));
    return sendSuccess(request, reply, { configured, enabled });
  });

  fastify.post("/agent/telephony/session", async (request, reply) => {
    try {
      const session = await createTelephonySession(request.tenant.id, currentUserId(request));
      return sendSuccess(request, reply, session);
    } catch (err) {
      mapTelephonyError(err);
    }
  });

  fastify.post("/agent/telephony/calls", async (request, reply) => {
    const body = (request.body ?? {}) as { phone?: string };
    try {
      const created = await requestOutboundCall({
        tenantId: request.tenant.id,
        userId: currentUserId(request),
        phone: String(body.phone ?? ""),
      });
      return sendSuccess(request, reply, created, 201);
    } catch (err) {
      mapTelephonyError(err);
    }
  });

  fastify.post("/agent/telephony/calls/:callId/abandon", async (request, reply) => {
    const { callId } = request.params as { callId: string };
    await abandonRequestedCall({ tenantId: request.tenant.id, userId: currentUserId(request), callId });
    return sendSuccess(request, reply, { ok: true });
  });

  fastify.get("/agent/telephony/calls", async (request, reply) => {
    const items = await listAgentRecentCalls(request.tenant.id, currentUserId(request));
    return sendSuccess(request, reply, items);
  });

  fastify.get("/agent/telephony/tabulacoes", async (request, reply) => {
    const items = await listTabulacoesForCall(request.tenant.id);
    return sendSuccess(
      request,
      reply,
      items.map((t) => ({ id: t.id, label: t.label, description: t.description }))
    );
  });

  fastify.post("/agent/telephony/calls/:callId/tabulate", async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const body = (request.body ?? {}) as { tabulacaoId?: string };
    if (!body.tabulacaoId) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "Informe a tabulação");
    }
    try {
      const updated = await tabulateCall({
        tenantId: request.tenant.id,
        userId: currentUserId(request),
        callId,
        tabulacaoId: body.tabulacaoId,
      });
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapTelephonyError(err);
    }
  });

  // --- Admin (permissão "telephony" via route-permissions) ----------------
  fastify.get("/admin/telephony/users", async (request, reply) => {
    const items = await listTelephonyUsers(request.tenant.id);
    return sendSuccess(request, reply, { configured: getTelephonyConfig() !== null, users: items });
  });

  fastify.put("/admin/telephony/users/:userId", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const body = (request.body ?? {}) as { enabled?: boolean };
    try {
      const updated = await setTelephonyUserEnabled({
        tenantId: request.tenant.id,
        userId,
        enabled: body.enabled === true,
      });
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapTelephonyError(err);
    }
  });

  fastify.get("/admin/telephony/calls", async (request, reply) => {
    const q = request.query as { from?: string; to?: string; userId?: string };
    const items = await listTenantCalls({ tenantId: request.tenant.id, from: q.from, to: q.to, userId: q.userId });
    return sendSuccess(request, reply, items);
  });
};

function tokenMatches(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Rotas chamadas pelo dialplan do Asterisk (CURL em 127.0.0.1:3000). Fora de /api e sem JWT;
 * protegidas pelo cabeçalho X-Telephony-Token. O Apache bloqueia /internal/ no acesso público.
 */
export const telephonyInternalRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    const config = getTelephonyConfig();
    const header = request.headers["x-telephony-token"];
    if (!config || !tokenMatches(Array.isArray(header) ? header[0] : header, config.internalToken)) {
      return reply.code(403).type("text/plain").send("forbidden");
    }
  });

  fastify.get("/internal/telephony/authorize", async (request, reply) => {
    const q = request.query as { callId?: string; endpoint?: string; number?: string };
    const result = await authorizeCallFromAsterisk({
      callId: String(q.callId ?? ""),
      endpoint: String(q.endpoint ?? ""),
      number: String(q.number ?? ""),
    });
    return reply.type("text/plain").send(result.ok ? "ok" : `deny:${result.reason}`);
  });

  fastify.get("/internal/telephony/finish", async (request, reply) => {
    const q = request.query as {
      callId?: string;
      dialStatus?: string;
      answered?: string;
      dialed?: string;
      cause?: string;
    };
    await finishCallFromAsterisk({
      callId: String(q.callId ?? ""),
      dialStatus: q.dialStatus,
      answeredSeconds: q.answered,
      dialedSeconds: q.dialed,
      hangupCause: q.cause,
    });
    return reply.type("text/plain").send("ok");
  });
};

export default telephonyRoutes;
