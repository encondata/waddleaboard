import { createApiClient } from "./lib.js";

const request = createApiClient((...args) => window.fetch(...args));

export const api = {
  me: () => request("/api/auth/me"),
  login: (username, password) => request("/api/auth/login", { method: "POST", json: { username, password } }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  stats: () => request("/api/stats"),
  duck: (code) => request(`/api/ducks/${encodeURIComponent(code)}`),
  finds: (code) => request(`/api/ducks/${encodeURIComponent(code)}/finds`),
  addFind: (code, formData) => request(`/api/ducks/${encodeURIComponent(code)}/finds`, { method: "POST", body: formData }),
  myDucks: () => request("/api/my/ducks"),
  adminStats: () => request("/api/admin/stats"),
  adminFinds: (status = "open") => request(`/api/admin/finds?status=${encodeURIComponent(status)}`),
  moderate: (id, action) => request(`/api/admin/finds/${id}/${action}`, { method: "POST" }),
  adminDucks: () => request("/api/admin/ducks"),
  createDuck: (duck) => request("/api/admin/ducks", { method: "POST", json: duck }),
  createUser: (user) => request("/api/admin/users", { method: "POST", json: user }),
};
