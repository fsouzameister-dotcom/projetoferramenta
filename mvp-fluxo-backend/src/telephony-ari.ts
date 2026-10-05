import type { TelephonyConfig } from "./config";

type AriField = { attribute: string; value: string };

async function ariRequest(
  config: TelephonyConfig,
  method: "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<Response> {
  const auth = Buffer.from(`${config.ariUser}:${config.ariPassword}`).toString("base64");
  return fetch(`${config.ariUrl}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
}

function toFields(values: Record<string, string>): AriField[] {
  return Object.entries(values).map(([attribute, value]) => ({ attribute, value }));
}

async function putPjsipObject(
  config: TelephonyConfig,
  type: "auth" | "aor" | "endpoint",
  id: string,
  values: Record<string, string>
): Promise<void> {
  const res = await ariRequest(
    config,
    "PUT",
    `/asterisk/config/dynamic/res_pjsip/${type}/${encodeURIComponent(id)}`,
    { fields: toFields(values) }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ARI PUT ${type}/${id} falhou: ${res.status} ${text.slice(0, 200)}`);
  }
}

async function deletePjsipObject(
  config: TelephonyConfig,
  type: "auth" | "aor" | "endpoint",
  id: string
): Promise<void> {
  const res = await ariRequest(
    config,
    "DELETE",
    `/asterisk/config/dynamic/res_pjsip/${type}/${encodeURIComponent(id)}`
  );
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`ARI DELETE ${type}/${id} falhou: ${res.status} ${text.slice(0, 200)}`);
  }
}

/** Cria/atualiza o ramal WebRTC do atendente (senha trocada a cada sessão). */
export async function upsertAgentEndpoint(
  config: TelephonyConfig,
  input: { sipUsername: string; password: string }
): Promise<void> {
  const id = input.sipUsername;
  await putPjsipObject(config, "auth", id, {
    auth_type: "userpass",
    username: id,
    password: input.password,
  });
  await putPjsipObject(config, "aor", id, {
    max_contacts: "1",
    remove_existing: "yes",
  });
  await putPjsipObject(config, "endpoint", id, {
    webrtc: "yes",
    dtls_auto_generate_cert: "yes",
    context: "clienton-agentes",
    disallow: "all",
    allow: "opus,alaw,ulaw",
    auth: id,
    aors: id,
  });
}

export async function removeAgentEndpoint(config: TelephonyConfig, sipUsername: string): Promise<void> {
  await deletePjsipObject(config, "endpoint", sipUsername);
  await deletePjsipObject(config, "aor", sipUsername);
  await deletePjsipObject(config, "auth", sipUsername);
}
