import fs from "fs-extra";
import { installedPath } from "../config.js";

export async function listCommand() {
  if (!(await fs.pathExists(installedPath))) {
    console.log("No skills installed yet.");
    return;
  }
  const installed = await fs.readJson(installedPath);
  for (const [name, details] of Object.entries(installed)) {
    const item = details as { version: string; path: string };
    console.log(`${name}@${item.version} — ${item.path}`);
  }
}
