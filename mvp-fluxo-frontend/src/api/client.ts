import axios from "axios";

const API_ORIGIN =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

export type ApiMeta = {
  requestId: string;
  timestamp: string;
};

export type ApiSuccess<T> = {
  data: T;
  meta?: ApiMeta;
};

export type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  meta?: ApiMeta;
};

export function unwrapApiData<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as ApiSuccess<T>).data;
  }
  return payload as T;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as ApiErrorResponse | undefined;
    const message = payload?.error?.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("jwt_token");
    const tenantId = localStorage.getItem("tenant_id");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (tenantId) {
      config.headers["x-tenant-id"] = tenantId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/** Login é rota pública em `POST /login` (fora do prefixo `/api`). */
export function loginRequest(body: {
  email: string;
  password: string;
  /** Opcional em produção; em dev o backend usa DEFAULT_LOGIN_TENANT_ID. */
  tenantId?: string;
}) {
  return axios.post<
    ApiSuccess<{
      message?: string;
      token: string;
      tenant_id: string;
      role_name?: string;
      name?: string;
    }>
  >(`${API_ORIGIN}/login`, body, {
    headers: { "Content-Type": "application/json" },
  });
}

export default api;
