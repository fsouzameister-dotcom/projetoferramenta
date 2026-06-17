import type { FastifyPluginAsync } from "fastify";
import { ApiError, ERROR_CODES, sendSuccess } from "../http";
import { listFlowsByTenant } from "../flows";
import { listWhatsAppChannels } from "../whatsapp-channels";
import {
  listCampaignTemplatesForChannel,
  renderTemplatePreview,
} from "../campaign-templates";
import {
  findPhoneColumn,
  parseSpreadsheetBuffer,
} from "../campaign-spreadsheet";
import {
  cancelCampaign,
  createCampaign,
  getCampaign,
  listCampaignRecipients,
  listCampaigns,
  pauseCampaign,
  resumeCampaign,
  retryFailedRecipients,
  startCampaignDispatch,
} from "../campaigns";
import type { CampaignTemplateOption } from "../campaign-templates";
import { buildCampaignReport, campaignReportToCsv } from "../campaign-reports";
import { buildCampaignDashboard } from "../campaign-dashboard";
import {
  WHATSAPP_PROVIDER_CLOUD,
  WHATSAPP_PROVIDER_TWILIO,
} from "../whatsapp-channels";

function mapCampaignError(err: unknown): never {
  const code = err instanceof Error ? err.message : "";
  if (code === "CAMPAIGN_CANCELLED") {
    throw new ApiError(409, ERROR_CODES.campaigns.CAMPAIGN_CANCELLED, "Campanha cancelada");
  }
  if (code === "CAMPAIGN_INVALID_STATUS") {
    throw new ApiError(409, ERROR_CODES.campaigns.CAMPAIGN_INVALID_STATUS, "Status da campanha não permite esta ação");
  }
  if (code === "CAMPAIGN_NO_PENDING") {
    throw new ApiError(409, ERROR_CODES.campaigns.CAMPAIGN_NO_PENDING, "Não há destinatários pendentes para disparar");
  }
  if (code === "CAMPAIGN_NOT_FOUND") {
    throw new ApiError(404, ERROR_CODES.campaigns.CAMPAIGN_NOT_FOUND, "Campanha não encontrada");
  }
  throw err;
}

const campaignRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/admin/campaigns/templates", async (request, reply) => {
    const tenantId = request.tenant.id;
    const channelAccountId = String((request.query as { channelAccountId?: string }).channelAccountId ?? "").trim();
    if (!channelAccountId) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "channelAccountId é obrigatório");
    }
    const templates = await listCampaignTemplatesForChannel(tenantId, channelAccountId);
    return sendSuccess(request, reply, templates);
  });

  fastify.get("/admin/campaigns/channels", async (request, reply) => {
    const channels = await listWhatsAppChannels(request.tenant.id);
    return sendSuccess(request, reply, channels);
  });

  fastify.post("/admin/campaigns/parse-spreadsheet", async (request, reply) => {
    const body = request.body as { filename?: string; contentBase64?: string };
    const filename = body.filename?.trim() ?? "upload.csv";
    const contentBase64 = body.contentBase64?.trim();
    if (!contentBase64) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "contentBase64 é obrigatório");
    }
    const buffer = Buffer.from(contentBase64, "base64");
    const parsed = parseSpreadsheetBuffer(buffer, filename);
    const phoneColumn = findPhoneColumn(parsed.headers);
    return sendSuccess(request, reply, {
      ...parsed,
      phoneColumn,
      sampleRow: parsed.rows[0] ?? {},
    });
  });

  fastify.post("/admin/campaigns/preview-template", async (request, reply) => {
    const body = request.body as {
      bodyPreview?: string;
      columnMapping?: Record<string, string>;
      sampleRow?: Record<string, string>;
    };
    const preview = renderTemplatePreview(
      body.bodyPreview ?? "",
      body.columnMapping ?? {},
      body.sampleRow ?? {}
    );
    return sendSuccess(request, reply, { preview });
  });

  fastify.get("/admin/campaigns", async (request, reply) => {
    const items = await listCampaigns(request.tenant.id);
    return sendSuccess(request, reply, items);
  });

  fastify.get("/admin/campaigns/:campaignId", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const item = await getCampaign(request.tenant.id, campaignId);
    if (!item) {
      throw new ApiError(404, ERROR_CODES.campaigns.CAMPAIGN_NOT_FOUND, "Campanha não encontrada");
    }
    return sendSuccess(request, reply, item);
  });

  fastify.post("/admin/campaigns", async (request, reply) => {
    const body = request.body as {
      name?: string;
      flowId?: string;
      channelAccountId?: string;
      channelLabel?: string;
      provider?: string;
      template?: {
        provider: string;
        templateId: string;
        displayName: string;
        language: string | null;
        variables: string[];
        bodyPreview: string;
        contentSid?: string;
        templateName?: string;
      };
      columnMapping?: Record<string, string>;
      phoneColumn?: string;
      sendIntervalSeconds?: number;
      spreadsheetHeaders?: string[];
      rows?: Record<string, string>[];
    };

    if (!body.name?.trim() || !body.flowId?.trim() || !body.channelAccountId?.trim() || !body.template) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "Dados incompletos para criar campanha");
    }
    const phoneColumn = body.phoneColumn?.trim() || findPhoneColumn(body.spreadsheetHeaders ?? []) || "Telefone";
    if (!body.rows?.length) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "Planilha sem linhas válidas");
    }
    for (const slot of body.template.variables) {
      if (!body.columnMapping?.[slot]?.trim()) {
        throw new ApiError(
          400,
          ERROR_CODES.common.VALIDATION_ERROR,
          `Mapeie a variável {{${slot}}} para uma coluna da planilha`
        );
      }
    }

    const templateProvider = body.template.provider;
    if (
      templateProvider !== WHATSAPP_PROVIDER_TWILIO &&
      templateProvider !== WHATSAPP_PROVIDER_CLOUD
    ) {
      throw new ApiError(400, ERROR_CODES.common.VALIDATION_ERROR, "Provedor de template inválido");
    }
    const template: CampaignTemplateOption = {
      ...body.template,
      provider: templateProvider,
    };

    const created = await createCampaign({
      tenantId: request.tenant.id,
      name: body.name.trim(),
      flowId: body.flowId.trim(),
      channelAccountId: body.channelAccountId.trim(),
      channelLabel: body.channelLabel,
      provider: body.provider,
      template,
      columnMapping: body.columnMapping ?? {},
      phoneColumn,
      sendIntervalSeconds: body.sendIntervalSeconds ?? 3,
      spreadsheetHeaders: body.spreadsheetHeaders ?? [],
      rows: body.rows,
    });
    return sendSuccess(request, reply, created, 201);
  });

  fastify.get("/admin/campaigns/:campaignId/recipients", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const q = request.query as { status?: string; page?: string; limit?: string };
    try {
      const result = await listCampaignRecipients({
        tenantId: request.tenant.id,
        campaignId,
        status: q.status,
        page: q.page ? Number(q.page) : undefined,
        limit: q.limit ? Number(q.limit) : undefined,
      });
      return sendSuccess(request, reply, result);
    } catch (err) {
      mapCampaignError(err);
    }
  });

  fastify.post("/admin/campaigns/:campaignId/dispatch", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    try {
      const updated = await startCampaignDispatch(request.tenant.id, campaignId);
      if (!updated) {
        throw new ApiError(404, ERROR_CODES.campaigns.CAMPAIGN_NOT_FOUND, "Campanha não encontrada");
      }
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapCampaignError(err);
    }
  });

  fastify.post("/admin/campaigns/:campaignId/pause", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    try {
      const updated = await pauseCampaign(request.tenant.id, campaignId);
      if (!updated) {
        throw new ApiError(404, ERROR_CODES.campaigns.CAMPAIGN_NOT_FOUND, "Campanha não encontrada");
      }
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapCampaignError(err);
    }
  });

  fastify.post("/admin/campaigns/:campaignId/resume", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    try {
      const updated = await resumeCampaign(request.tenant.id, campaignId);
      if (!updated) {
        throw new ApiError(404, ERROR_CODES.campaigns.CAMPAIGN_NOT_FOUND, "Campanha não encontrada");
      }
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapCampaignError(err);
    }
  });

  fastify.post("/admin/campaigns/:campaignId/cancel", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    try {
      const updated = await cancelCampaign(request.tenant.id, campaignId);
      if (!updated) {
        throw new ApiError(404, ERROR_CODES.campaigns.CAMPAIGN_NOT_FOUND, "Campanha não encontrada");
      }
      return sendSuccess(request, reply, updated);
    } catch (err) {
      mapCampaignError(err);
    }
  });

  fastify.post("/admin/campaigns/:campaignId/retry-failed", async (request, reply) => {
    const { campaignId } = request.params as { campaignId: string };
    const body = (request.body ?? {}) as { recipientIds?: string[] };
    try {
      const result = await retryFailedRecipients(
        request.tenant.id,
        campaignId,
        body.recipientIds
      );
      if (!result.campaign) {
        throw new ApiError(404, ERROR_CODES.campaigns.CAMPAIGN_NOT_FOUND, "Campanha não encontrada");
      }
      return sendSuccess(request, reply, result);
    } catch (err) {
      mapCampaignError(err);
    }
  });

  fastify.get("/admin/campaigns/dashboard", async (request, reply) => {
    const q = request.query as {
      campaignId?: string;
      from?: string;
      to?: string;
    };
    const data = await buildCampaignDashboard({
      tenantId: request.tenant.id,
      campaignId: q.campaignId,
      from: q.from,
      to: q.to,
    });
    return sendSuccess(request, reply, data);
  });

  fastify.get("/reports/campaigns", async (request, reply) => {
    const q = request.query as {
      flowId?: string;
      campaignId?: string;
      from?: string;
      to?: string;
      format?: string;
    };
    const rows = await buildCampaignReport({
      tenantId: request.tenant.id,
      flowId: q.flowId,
      campaignId: q.campaignId,
      from: q.from,
      to: q.to,
    });
    if (q.format === "csv") {
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", 'attachment; filename="campanhas.csv"');
      return reply.send(campaignReportToCsv(rows));
    }
    return sendSuccess(request, reply, { rows });
  });

  fastify.get("/admin/campaigns/options/flows", async (request, reply) => {
    const flows = await listFlowsByTenant(request.tenant.id);
    return sendSuccess(request, reply, flows);
  });
};

export default campaignRoutes;
