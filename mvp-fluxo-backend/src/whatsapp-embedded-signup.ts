/**
 * Onboarding Tech Provider via Meta Embedded Signup.
 * Troca code → business token, subscribe WABA, register phone, persiste canal Cloud API.
 */
import { randomInt } from "crypto";

/** Evita importar `config.ts` (JWT obrigatório) em testes unitários. */
function graphVersion(): string {
  return process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v21.0";
}

function graphBase(): string {
  return `https://graph.facebook.com/${graphVersion()}`;
}

export type EmbeddedSignupConfig = {
  enabled: boolean;
  appId: string | null;
  configId: string | null;
  graphVersion: string;
};

export async function getEmbeddedSignupConfig(): Promise<EmbeddedSignupConfig> {
  const {
    resolveMetaAppId,
    resolveMetaAppSecret,
    resolveMetaEmbeddedSignupConfigId,
  } = await import("./server-whatsapp-settings.js");
  const appId = (await resolveMetaAppId()) ?? null;
  const configId = (await resolveMetaEmbeddedSignupConfigId()) ?? null;
  const secret = await resolveMetaAppSecret();
  return {
    enabled: Boolean(appId && configId && secret),
    appId,
    configId,
    graphVersion: graphVersion(),
  };
}

export class EmbeddedSignupError extends Error {
  constructor(
    message: string,
    public readonly step: "config" | "exchange" | "subscribe" | "register" | "persist",
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "EmbeddedSignupError";
  }
}

export type GraphFetch = typeof fetch;

function generateTwoStepPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function exchangeEmbeddedSignupCode(
  code: string,
  deps?: { fetchFn?: GraphFetch; appId?: string; appSecret?: string }
): Promise<string> {
  let appId = deps?.appId;
  let appSecret = deps?.appSecret;
  if (!appId || !appSecret) {
    const { resolveMetaAppId, resolveMetaAppSecret } = await import(
      "./server-whatsapp-settings.js"
    );
    appId = appId || (await resolveMetaAppId());
    appSecret = appSecret || (await resolveMetaAppSecret());
  }
  if (!appId || !appSecret) {
    throw new EmbeddedSignupError(
      "Meta App ID e App Secret não configurados (env ou settings)",
      "config"
    );
  }
  const fetchFn = deps?.fetchFn ?? fetch;
  const url = new URL(`${graphBase()}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code.trim());

  const res = await fetchFn(url.toString(), { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: { message?: string; code?: number; type?: string };
  };
  if (!res.ok || !json.access_token) {
    throw new EmbeddedSignupError(
      json.error?.message || "Falha ao trocar code por business token",
      "exchange",
      json.error ?? json
    );
  }
  return json.access_token;
}

export async function subscribeAppToWaba(
  wabaId: string,
  businessToken: string,
  deps?: { fetchFn?: GraphFetch }
): Promise<void> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const url = `${graphBase()}/${encodeURIComponent(wabaId.trim())}/subscribed_apps`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${businessToken}`,
      "Content-Type": "application/json",
    },
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string };
  };
  if (!res.ok || json.success === false) {
    throw new EmbeddedSignupError(
      json.error?.message || "Falha ao inscrever o app nos webhooks da WABA",
      "subscribe",
      json
    );
  }
}

export async function registerPhoneNumber(
  phoneNumberId: string,
  businessToken: string,
  pin: string,
  deps?: { fetchFn?: GraphFetch }
): Promise<void> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const url = `${graphBase()}/${encodeURIComponent(phoneNumberId.trim())}/register`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${businessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      pin,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: { message?: string };
  };
  if (!res.ok || json.success === false) {
    throw new EmbeddedSignupError(
      json.error?.message || "Falha ao registrar o número na Cloud API",
      "register",
      json
    );
  }
}

/** Best-effort: display phone a partir do Graph. */
export async function fetchDisplayPhoneNumber(
  phoneNumberId: string,
  businessToken: string,
  deps?: { fetchFn?: GraphFetch }
): Promise<string | null> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const url =
    `${graphBase()}/${encodeURIComponent(phoneNumberId.trim())}` +
    `?fields=display_phone_number`;
  try {
    const res = await fetchFn(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${businessToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string;
    };
    if (!res.ok) return null;
    return json.display_phone_number?.trim() || null;
  } catch {
    return null;
  }
}

export type OnboardEmbeddedSignupInput = {
  tenantId: string;
  code: string;
  wabaId: string;
  phoneNumberId: string;
  label?: string;
  displayPhoneNumber?: string;
};

export type OnboardEmbeddedSignupResult = {
  channelId: string;
  phoneNumberId: string;
  wabaId: string;
};

export type CreateChannelFn = (input: {
  tenantId: string;
  label?: string;
  wabaId: string;
  accessToken: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  twoStepPin?: string;
}) => Promise<{ channelId: string; phoneNumberId: string }>;

export type OnboardEmbeddedSignupDeps = {
  fetchFn?: GraphFetch;
  appId?: string;
  appSecret?: string;
  createChannel?: CreateChannelFn;
  generatePin?: () => string;
};

export async function onboardEmbeddedSignup(
  input: OnboardEmbeddedSignupInput,
  deps?: OnboardEmbeddedSignupDeps
): Promise<OnboardEmbeddedSignupResult> {
  const code = input.code.trim();
  const wabaId = input.wabaId.trim();
  const phoneNumberId = input.phoneNumberId.trim();
  if (!code || !wabaId || !phoneNumberId) {
    throw new EmbeddedSignupError(
      "code, wabaId e phoneNumberId são obrigatórios",
      "config"
    );
  }

  const fetchFn = deps?.fetchFn ?? fetch;
  const pin = (deps?.generatePin ?? generateTwoStepPin)();

  let appId = deps?.appId;
  let appSecret = deps?.appSecret;
  const explicitCreds = deps?.appId !== undefined && deps?.appSecret !== undefined;
  if (explicitCreds) {
    if (!appId?.trim() || !appSecret?.trim()) {
      throw new EmbeddedSignupError(
        "Embedded Signup não está habilitado (faltam App ID ou App Secret)",
        "config"
      );
    }
  } else {
    const {
      resolveMetaAppId,
      resolveMetaAppSecret,
      resolveMetaEmbeddedSignupConfigId,
    } = await import("./server-whatsapp-settings.js");
    appId = await resolveMetaAppId();
    appSecret = await resolveMetaAppSecret();
    if (!appId || !appSecret) {
      throw new EmbeddedSignupError(
        "Embedded Signup não está habilitado (faltam App ID ou App Secret)",
        "config"
      );
    }
    const configId = await resolveMetaEmbeddedSignupConfigId();
    if (!configId) {
      throw new EmbeddedSignupError(
        "Embedded Signup não está habilitado (falta Config ID)",
        "config"
      );
    }
  }

  const businessToken = await exchangeEmbeddedSignupCode(code, {
    fetchFn,
    appId,
    appSecret,
  });

  await subscribeAppToWaba(wabaId, businessToken, { fetchFn });
  await registerPhoneNumber(phoneNumberId, businessToken, pin, { fetchFn });

  const display =
    input.displayPhoneNumber?.trim() ||
    (await fetchDisplayPhoneNumber(phoneNumberId, businessToken, { fetchFn })) ||
    undefined;

  const createChannel: CreateChannelFn =
    deps?.createChannel ??
    (async (payload) => {
      const { createWhatsAppChannelOptionB } = await import("./whatsapp-channels.js");
      return createWhatsAppChannelOptionB(payload);
    });

  try {
    const created = await createChannel({
      tenantId: input.tenantId,
      label: input.label?.trim() || "WhatsApp Meta",
      wabaId,
      accessToken: businessToken,
      phoneNumberId,
      displayPhoneNumber: display,
      twoStepPin: pin,
    });
    return {
      channelId: created.channelId,
      phoneNumberId: created.phoneNumberId,
      wabaId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao persistir canal";
    throw new EmbeddedSignupError(msg, "persist", err);
  }
}
