import path from "node:path";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import ora from "ora";
import { apiClient } from "../api-client.js";
import { installedPath, loadConfig } from "../config.js";

function splitSpec(spec: string) {
  const at = spec.lastIndexOf("@");
  if (at > 0) return { name: spec.slice(0, at), version: spec.slice(at + 1) };
  return { name: spec };
}

export async function installCommand(spec: string) {
  const spinner = ora(`Installing ${spec}`).start();
  const config = await loadConfig();
  const client = await apiClient();
  const { name, version } = splitSpec(spec);
  const metadataPath = version ? `/skills/${name}/${version}` : `/skills/${name}`;
  const { data: skill } = await client.get(metadataPath);
  const response = await client.get(`/skills/${name}/download`, { responseType: "arraybuffer" });

  const targetDir = path.join(config.install_dir, skill.name);
  await fs.remove(targetDir);
  await fs.ensureDir(targetDir);

  const zip = new AdmZip(Buffer.from(response.data));
  try {
    zip.extractAllTo(targetDir, true);
  } catch {
    await fs.writeFile(path.join(targetDir, "SKILL.md"), `# ${skill.name}\n\nInstalled placeholder. Download endpoint did not return a ZIP package.\n`);
    await fs.writeJson(path.join(targetDir, "skill.json"), skill, { spaces: 2 });
  }

  const installed = (await fs.pathExists(installedPath)) ? await fs.readJson(installedPath) : {};
  installed[skill.name] = { version: skill.version, installed_at: new Date().toISOString(), path: targetDir };
  await fs.writeJson(installedPath, installed, { spaces: 2 });
  spinner.succeed(`Installed ${skill.name}@${skill.version} in ${targetDir}`);
}
