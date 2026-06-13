import path from "node:path";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import type { SkillManifest } from "./manifest.js";

const includedEntries = ["skill.json", "SKILL.md", "scripts", "references", "assets"];

export async function packageSkill(directory: string, manifest: SkillManifest): Promise<{ filePath: string; size: number }> {
  const outDir = path.join(directory, ".fateskill");
  await fs.ensureDir(outDir);
  const filePath = path.join(outDir, `${manifest.name}-${manifest.version}.skill`);
  const zip = new AdmZip();

  for (const entry of includedEntries) {
    const source = path.join(directory, entry);
    if (!(await fs.pathExists(source))) continue;
    const stat = await fs.stat(source);
    if (stat.isDirectory()) zip.addLocalFolder(source, entry);
    else zip.addLocalFile(source);
  }

  zip.writeZip(filePath);
  const { size } = await fs.stat(filePath);
  return { filePath, size };
}
