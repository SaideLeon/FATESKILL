import { loadConfig, saveConfig } from "../config.js";

export async function loginCommand(token?: string) {
  const config = await loadConfig();
  config.auth_token = token ?? process.env.FATESKILL_TOKEN;
  if (!config.auth_token) throw new Error("Provide a token with --token or FATESKILL_TOKEN");
  await saveConfig(config);
  console.log("✓ authenticated");
}

export async function logoutCommand() {
  const config = await loadConfig();
  delete config.auth_token;
  await saveConfig(config);
  console.log("✓ logged out");
}

export async function whoamiCommand() {
  const config = await loadConfig();
  console.log(config.auth_token ? "Authenticated with API token" : "Anonymous");
  console.log(`registry: ${config.registry}`);
}
