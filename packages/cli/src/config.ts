import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

export type SkillHubConfig = {
  registry: string;
  install_dir: string;
  auth_token?: string;
};

export const configDir = path.join(os.homedir(), ".skillhub");
export const configPath = path.join(configDir, "config.json");
export const installedPath = path.join(configDir, "installed.json");

export async function loadConfig(): Promise<SkillHubConfig> {
  await fs.ensureDir(configDir);
  if (!(await fs.pathExists(configPath))) {
    const defaults: SkillHubConfig = {
      registry: process.env.SKILLHUB_REGISTRY ?? "https://skillhub.dev/api/v1",
      install_dir: process.env.SKILLHUB_INSTALL_DIR ?? path.join(os.homedir(), ".skillhub", "skills")
    };
    await fs.writeJson(configPath, defaults, { spaces: 2 });
    return defaults;
  }
  return fs.readJson(configPath);
}

export async function saveConfig(config: SkillHubConfig) {
  await fs.ensureDir(configDir);
  await fs.writeJson(configPath, config, { spaces: 2 });
}
