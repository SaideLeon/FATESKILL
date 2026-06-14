import { apiClient } from "../api-client.js";
import { loadConfig, saveConfig } from "../config.js";

export async function loginCommand(token?: string) {
  const config = await loadConfig();
  const authToken = token ?? process.env.FATESKILL_TOKEN;
  if (!authToken) {
    throw new Error(
      "Provide a token with --token or FATESKILL_TOKEN.\n" +
      "Generate one at https://fateskill.vercel.app/settings (scope: publish)."
    );
  }

  config.auth_token = authToken;
  await saveConfig(config);
  const client = await apiClient();
  try {
    const { data } = await client.get("/auth/whoami");
    console.log(`✓ authenticated as @${data.username} (scopes: ${data.scopes.join(", ")})`);
  } catch {
    delete config.auth_token;
    await saveConfig(config);
    throw new Error("Invalid or expired token");
  }
}

export async function logoutCommand() {
  const config = await loadConfig();
  delete config.auth_token;
  await saveConfig(config);
  console.log("✓ logged out");
}

export async function whoamiCommand() {
  const config = await loadConfig();
  if (!config.auth_token) {
    console.log("Anonymous");
    console.log(`registry: ${config.registry}`);
    return;
  }
  const client = await apiClient();
  const { data } = await client.get("/auth/whoami");
  console.log(`@${data.username} (${data.scopes.join(", ")})`);
  console.log(`registry: ${config.registry}`);
}
