import os from "node:os";
import path from "node:path";
import fs from "fs-extra";

export type FateSkillConfig = {
  registry: string;
  install_dir: string;
  auth_token?: string;
};

export const configDir = path.join(os.homedir(), ".fateskill");
export const configPath = path.join(configDir, "config.json");
export const installedPath = path.join(configDir, "installed.json");

export async function loadConfig(): Promise<FateSkillConfig> {
  await fs.ensureDir(configDir);
  if (!(await fs.pathExists(configPath))) {
    const defaults: FateSkillConfig = {
      registry: process.env.FATESKILL_REGISTRY ?? "https://fateskill.vercel.app/api/v1",
      install_dir: process.env.FATESKILL_INSTALL_DIR ?? path.join(os.homedir(), ".fateskill", "skills")
    };
    await fs.writeJson(configPath, defaults, { spaces: 2 });
    return defaults;
  }
  return fs.readJson(configPath);
}

export async function saveConfig(config: FateSkillConfig) {
  await fs.ensureDir(configDir);
  await fs.writeJson(configPath, config, { spaces: 2 });
}
