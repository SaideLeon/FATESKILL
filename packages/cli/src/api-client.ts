import axios from "axios";
import { loadConfig } from "./config.js";

export async function apiClient() {
  const config = await loadConfig();
  return axios.create({
    baseURL: config.registry,
    headers: config.auth_token ? { Authorization: `Bearer ${config.auth_token}` } : undefined,
    timeout: 30_000,
    maxRedirects: 5
  });
}
