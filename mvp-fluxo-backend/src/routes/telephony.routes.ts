import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { getTelephonyConfig } from "../config";
import { ApiError, ERROR_CODES, sendSuccess } from "../http";
import {
  abandonRequestedCall,
  authorizeCallFromAsterisk,
  createTelephonySession,
  finishCallFromAsterisk,
  getRecordedCall,
  isTelephonyEnabledForUser,
  listAgentRecentCalls,
  listTabulacoesForCall,
  listTelephonyUsers,
  listTenantCalls,
  requestOutboundCall,
  setTelephonyUserEnabled,
  tabulateCall,
} from "../telephony";
import {
  addVoiceCampaignContacts,
  createVoiceCampaign,
  listAgentVoiceCampaigns,
  listVoiceCampaigns,
  listVoiceQueues,
  previewVoiceSpreadsheet,
  requestNextCampaignContact,
  updateVoiceCampaign,
} from "../voice-campaigns";
import type { VoiceContactOutcome } from "../voice-campaign-rules";
import { tokenMatches } from "../telephony-rules";

const VOICE_CAMPAIGN_VALIDATION: Record<string, string> = {
  VOICE_CAMPAIGN_FILE_REQUIRED: "Envie a planilha de contatos",
  VOICE_CAMPAIGN_FILE_INVALID: "Arquivo inválido. Use .xlsx, .xls ou .csv",
  VOICE_CAMPAIGN_FILE_EMPTY: "A planilha está vazia ou sem cabeçalho",
  VOICE_CAMPAIGN_FILE_TOO_LARGE: "A planilha tem mais de 50.000 linhas. Divida em arquivos menores",
  VOICE_CAMPAIGN_PHONE_COLUMN: "Selecione a coluna de telefone",
  VOICE_CAMPAIGN_NAME_REQUIRED: "Informe o nome da campanha",
};

function recordingsDir(): string {
  return process.env.VOICE_RECORDINGS_DIR?.trim() || "/var/spool/asterisk/monitor/clienton";
}

function mapTelephonyError(err: unknown): never {
  const code = err instanceof Error ? err.message : "";
  const t = ERROR_CODES.telephony;
  if (VOICE_CAMPAIGN_VALIDATION[code]) {
    throw new ApiError(400, t.VOICE_CAMPAIGN_INVALID, VOICE_CAMPAIGN_VALIDATION[code]);
  }
  if (code === "VOICE_CAMPAIGN_NOT_FOUND") {
    throw new ApiError(404, t.VOICE_CAMPAIGN_NOT_FOUND, "Campanha não encontrada ou não disponível para você");
  }
  if (code === "VOICE_CAMPAIGN_NO_CONTACTS") {
    throw new ApiError(404, t.VOICE_CAMPAIGN_NO_CONTACTS, "Nenhum contato disponível agora nesta campanha");
  }
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

  fastify.get("/agent/telephony/campaigns", async (request, reply) => {
    const items = await listAgentVoiceCampaigns(request.tenant.id, currentUserId(request));
    return sendSuccess(request, reply, items);
  });

  fastify.post("/agent/telephony/campaigns/:campaignId/next", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    try {
      const next = await requestNextCampaignContact({
        tenantId: request.tenant.id,
        userId: currentUserId(request),
        campaignId,
      });
      return sendSuccess(request, reply, next, 201);
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
    const body = (request.body ?? {}) as { tabulacaoId?: string; outcome?: string };
    if (!body.tabulacaoId) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "Informe a tabulação");
    }
    const outcome =
      body.outcome === "done" || body.outcome === "retry" || body.outcome === "do_not_call"
        ? (body.outcome as VoiceContactOutcome)
        : null;
    try {
      const updated = await tabulateCall({
        tenantId: request.tenant.id,
        userId: currentUserId(request),
        callId,
        tabulacaoId: body.tabulacaoId,
        outcome,
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
    const q = request.query as { from?: string; to?: string; userId?: string; campaignId?: string };
    const items = await listTenantCalls({
      tenantId: request.tenant.id,
      from: q.from,
      to: q.to,
      userId: q.userId,
      campaignId: q.campaignId,
    });
    return sendSuccess(request, reply, items);
  });

  fastify.get("/admin/telephony/calls/:callId/recording", async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const call = await getRecordedCall(request.tenant.id, callId);
    if (!call?.recorded) {
      throw new ApiError(404, ERROR_CODES.telephony.TELEPHONY_RECORDING_NOT_FOUND, "Gravação não encontrada");
    }
    for (const [ext, mime] of [
      ["ogg", "audio/ogg"],
      ["wav", "audio/wav"],
    ] as const) {
      const file = path.join(recordingsDir(), `${call.id}.${ext}`);
      const info = await stat(file).catch(() => null);
      if (info?.isFile() && info.size > 0) {
        reply.header("Content-Length", info.size);
        reply.header("Cache-Control", "private, max-age=300");
        reply.header("Content-Disposition", `inline; filename="ligacao-${call.id}.${ext}"`);
        return reply.type(mime).send(createReadStream(file));
      }
    }
    throw new ApiError(404, ERROR_CODES.telephony.TELEPHONY_RECORDING_NOT_FOUND, "Gravação não encontrada");
  });

  // --- Campanhas de voz (mailing de telefonia) ---------------------------
  fastify.get("/admin/telephony/queues", async (request, reply) => {
    return sendSuccess(request, reply, await listVoiceQueues(request.tenant.id));
  });

  fastify.post("/admin/telephony/parse-spreadsheet", async (request, reply) => {
    const body = (request.body ?? {}) as { filename?: string; contentBase64?: string };
    try {
      return sendSuccess(request, reply, previewVoiceSpreadsheet(body));
    } catch (err) {
      mapTelephonyError(err);
    }
  });

  fastify.get("/admin/telephony/campaigns", async (request, reply) => {
    return sendSuccess(request, reply, await listVoiceCampaigns(request.tenant.id));
  });

  fastify.post("/admin/telephony/campaigns", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      const created = await createVoiceCampaign({
        tenantId: request.tenant.id,
        userId: currentUserId(request),
        name: typeof body.name === "string" ? body.name : undefined,
        queueIds: body.queueIds,
        maxAttempts: body.maxAttempts,
        retryIntervalMinutes: body.retryIntervalMinutes,
        recordCalls: body.recordCalls,
        filename: typeof body.filename === "string" ? body.filename : undefined,
        contentBase64: typeof body.contentBase64 === "string" ? body.contentBase64 : undefined,
        phoneColumn: typeof body.phoneColumn === "string" ? body.phoneColumn : undefined,
        nameColumn: typeof body.nameColumn === "string" ? body.nameColumn : null,
      });
      return sendSuccess(request, reply, created, 201);
    } catch (err) {
      mapTelephonyError(err);
    }
  });

  fastify.post("/admin/telephony/campaigns/:campaignId/contacts", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      const updated = await addVoiceCampaignContacts({
        tenantId: request.tenant.id,
        campaignId,
        filename: typeof body.filename === "string" ? body.filename : undefined,
        contentBase64: typeof body.contentBase64 === "string" ? body.contentBase64 : undefined,
        phoneColumn: typeof body.phoneColumn === "string" ? body.phoneColumn : undefined,
        nameColumn: typeof body.nameColumn === "string" ? body.nameColumn : null,
      });
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapTelephonyError(err);
    }
  });

  fastify.put("/admin/telephony/campaigns/:campaignId", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      const updated = await updateVoiceCampaign({
        tenantId: request.tenant.id,
        campaignId,
        name: typeof body.name === "string" ? body.name : undefined,
        status: typeof body.status === "string" ? body.status : undefined,
        queueIds: body.queueIds,
        maxAttempts: body.maxAttempts,
        retryIntervalMinutes: body.retryIntervalMinutes,
        recordCalls: body.recordCalls,
      });
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapTelephonyError(err);
    }
  });
};

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
    const text = result.ok ? (result.record ? "ok:rec" : "ok") : `deny:${result.reason}`;
    return reply.type("text/plain").send(text);
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
