import type { AxiosInstance, AxiosPromise } from "axios";

declare const api: AxiosInstance;

export function loginRequest(body: {
  email: string;
  password: string;
  tenantId?: string;
}): AxiosPromise<{
  data: {
    message?: string;
    token: string;
    tenant_id: string;
    role_name?: string;
    name?: string;
  };
  meta?: { requestId: string; timestamp: string };
}>;

export default api;
