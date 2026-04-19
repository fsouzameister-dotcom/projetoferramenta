import axios from "axios";

const API_ORIGIN =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

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
  tenantId: string;
}) {
  return axios.post<{ message?: string; token: string }>(
    `${API_ORIGIN}/login`,
    body,
    { headers: { "Content-Type": "application/json" } }
  );
}

export default api;
