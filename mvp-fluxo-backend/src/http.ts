import { FastifyReply, FastifyRequest } from "fastify";

export const ERROR_CODES = {
  common: {
    INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
    VALIDATION_ERROR: "VALIDATION_ERROR",
  },
  auth: {
    INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
    AUTH_HEADER_INVALID: "AUTH_HEADER_INVALID",
    TOKEN_INVALID: "TOKEN_INVALID",
    USER_INVALID: "USER_INVALID",
    TOKEN_TENANT_MISMATCH: "TOKEN_TENANT_MISMATCH",
    LOGIN_FAILED: "LOGIN_FAILED",
    AUTH_MIDDLEWARE_ERROR: "AUTH_MIDDLEWARE_ERROR",
  },
  tenant: {
    TENANT_REQUIRED: "TENANT_REQUIRED",
    TENANT_HEADER_REQUIRED: "TENANT_HEADER_REQUIRED",
    TENANT_NOT_FOUND: "TENANT_NOT_FOUND",
    TENANT_MIDDLEWARE_ERROR: "TENANT_MIDDLEWARE_ERROR",
  },
  platform: {
    PLATFORM_FORBIDDEN: "PLATFORM_FORBIDDEN",
    TENANTS_LIST_FAILED: "PLATFORM_TENANTS_LIST_FAILED",
    TENANT_CREATE_FAILED: "PLATFORM_TENANT_CREATE_FAILED",
    TENANT_SLUG_EXISTS: "PLATFORM_TENANT_SLUG_EXISTS",
    TENANT_SLUG_INVALID: "PLATFORM_TENANT_SLUG_INVALID",
    NOT_CUSTOMER_TENANT: "PLATFORM_NOT_CUSTOMER_TENANT",
  },
  flows: {
    FLOWS_LIST_FAILED: "FLOWS_LIST_FAILED",
    FLOW_NOT_FOUND: "FLOW_NOT_FOUND",
    FLOW_GET_FAILED: "FLOW_GET_FAILED",
    FLOW_CREATE_FAILED: "FLOW_CREATE_FAILED",
    FLOW_UPDATE_FAILED: "FLOW_UPDATE_FAILED",
  },
  nodes: {
    NODES_LIST_FAILED: "NODES_LIST_FAILED",
    NODE_CREATE_FAILED: "NODE_CREATE_FAILED",
    NODE_NOT_FOUND: "NODE_NOT_FOUND",
    NODE_UPDATE_FAILED: "NODE_UPDATE_FAILED",
    NODE_DELETE_FAILED: "NODE_DELETE_FAILED",
  },
  execution: {
    FLOW_EXECUTION_INVALID: "FLOW_EXECUTION_INVALID",
    FLOW_EXECUTION_API_CALL_FAILED: "FLOW_EXECUTION_API_CALL_FAILED",
    FLOW_EXECUTION_FAILED: "FLOW_EXECUTION_FAILED",
  },
  reports: {
    FLOW_RESPONSES_LIST_FAILED: "FLOW_RESPONSES_LIST_FAILED",
    FLOW_RESPONSES_AGGREGATE_FAILED: "FLOW_RESPONSES_AGGREGATE_FAILED",
  },
  tabulacoes: {
    TABULACOES_LIST_FAILED: "TABULACOES_LIST_FAILED",
    TABULACAO_CREATE_FAILED: "TABULACAO_CREATE_FAILED",
    TABULACAO_UPDATE_FAILED: "TABULACAO_UPDATE_FAILED",
    TABULACAO_DELETE_FAILED: "TABULACAO_DELETE_FAILED",
    TABULACAO_NOT_FOUND: "TABULACAO_NOT_FOUND",
    TABULACAO_KEY_DUPLICATE: "TABULACAO_KEY_DUPLICATE",
  },
  clients: {
    CLIENTS_LIST_FAILED: "CLIENTS_LIST_FAILED",
    CLIENT_CREATE_FAILED: "CLIENT_CREATE_FAILED",
  },
  users: {
    USERS_LIST_FAILED: "USERS_LIST_FAILED",
    USER_CREATE_FAILED: "USER_CREATE_FAILED",
    USER_UPDATE_FAILED: "USER_UPDATE_FAILED",
    USER_DELETE_FAILED: "USER_DELETE_FAILED",
    USER_NOT_FOUND: "USER_NOT_FOUND",
    USER_EMAIL_ALREADY_EXISTS: "USER_EMAIL_ALREADY_EXISTS",
    ROLE_REQUIRED: "ROLE_REQUIRED",
    FORBIDDEN_ROLE: "FORBIDDEN_ROLE",
  },
  agent: {
    AGENT_CONVERSATIONS_LIST_FAILED: "AGENT_CONVERSATIONS_LIST_FAILED",
    AGENT_CONVERSATION_NOT_FOUND: "AGENT_CONVERSATION_NOT_FOUND",
    AGENT_CONVERSATION_CREATE_FAILED: "AGENT_CONVERSATION_CREATE_FAILED",
    AGENT_MESSAGE_SEND_FAILED: "AGENT_MESSAGE_SEND_FAILED",
    AGENT_MESSAGE_NOT_FOUND: "AGENT_MESSAGE_NOT_FOUND",
    AGENT_MESSAGE_STATUS_UPDATE_FAILED: "AGENT_MESSAGE_STATUS_UPDATE_FAILED",
  },
  ai: {
    AI_PROVIDER_CREATE_FAILED: "AI_PROVIDER_CREATE_FAILED",
    AI_PROVIDERS_LIST_FAILED: "AI_PROVIDERS_LIST_FAILED",
    AI_PROVIDER_NOT_FOUND: "AI_PROVIDER_NOT_FOUND",
    AI_PERSONA_CREATE_FAILED: "AI_PERSONA_CREATE_FAILED",
    AI_PERSONA_UPDATE_FAILED: "AI_PERSONA_UPDATE_FAILED",
    AI_PERSONA_NOT_FOUND: "AI_PERSONA_NOT_FOUND",
    AI_PERSONAS_LIST_FAILED: "AI_PERSONAS_LIST_FAILED",
    AI_SCRIPT_CREATE_FAILED: "AI_SCRIPT_CREATE_FAILED",
    AI_RESPONSE_FAILED: "AI_RESPONSE_FAILED",
    AI_RESPONSE_INVALID: "AI_RESPONSE_INVALID",
    AI_HINT_GENERATION_FAILED: "AI_HINT_GENERATION_FAILED",
    AI_FORBIDDEN_ROLE: "AI_FORBIDDEN_ROLE",
  },
  whatsapp: {
    WHATSAPP_CHANNELS_LIST_FAILED: "WHATSAPP_CHANNELS_LIST_FAILED",
    WHATSAPP_CHANNEL_CREATE_FAILED: "WHATSAPP_CHANNEL_CREATE_FAILED",
    WHATSAPP_CHANNEL_NOT_FOUND: "WHATSAPP_CHANNEL_NOT_FOUND",
    WHATSAPP_CHANNEL_UPDATE_FAILED: "WHATSAPP_CHANNEL_UPDATE_FAILED",
    WHATSAPP_CHANNEL_DELETE_FAILED: "WHATSAPP_CHANNEL_DELETE_FAILED",
    WHATSAPP_SERVER_SETTINGS_GET_FAILED: "WHATSAPP_SERVER_SETTINGS_GET_FAILED",
    WHATSAPP_SERVER_SETTINGS_UPDATE_FAILED: "WHATSAPP_SERVER_SETTINGS_UPDATE_FAILED",
    WHATSAPP_TWILIO_CONTENT_TEMPLATES_FAILED: "WHATSAPP_TWILIO_CONTENT_TEMPLATES_FAILED",
  },
} as const;

export type ApiMeta = {
  requestId: string;
  timestamp: string;
};

export type ApiSuccess<T> = {
  data: T;
  meta: ApiMeta;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: ApiMeta;
};

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const apiMetaSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requestId", "timestamp"],
  properties: {
    requestId: { type: "string" },
    timestamp: { type: "string" },
  },
} as const;

export function successEnvelopeSchema(dataSchema: unknown) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["data", "meta"],
    properties: {
      data: dataSchema,
      meta: apiMetaSchema,
    },
  } as const;
}

export function errorEnvelopeSchema(errorCodes?: readonly string[]) {
  const codeSchema = errorCodes?.length
    ? { type: "string", enum: errorCodes }
    : { type: "string" };

  return {
    type: "object",
    additionalProperties: false,
    required: ["error", "meta"],
    properties: {
      error: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message"],
        properties: {
          code: codeSchema,
          message: { type: "string" },
          details: {},
        },
      },
      meta: apiMetaSchema,
    },
  } as const;
}

function meta(request: FastifyRequest): ApiMeta {
  return {
    requestId: request.id,
    timestamp: new Date().toISOString(),
  };
}

export function sendSuccess<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  data: T,
  statusCode = 200
) {
  return reply.code(statusCode).send({
    data,
    meta: meta(request),
  } as ApiSuccess<T>);
}

export function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
) {
  return reply.code(statusCode).send({
    error: { code, message, details },
    meta: meta(request),
  } as ApiErrorBody);
}
