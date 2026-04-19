import type { AxiosInstance, AxiosResponse } from "axios";

declare const api: AxiosInstance;

export function loginRequest(body: {
  email: string;
  password: string;
  tenantId: string;
}): AxiosResponse<{ message?: string; token: string }>;

export default api;
