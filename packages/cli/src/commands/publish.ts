import fs from "fs-extra";
import ora from "ora";
import { apiClient } from "../api-client.js";
import { readManifest } from "../utils/manifest.js";
import { packageSkill } from "../utils/package-skill.js";

export async function publishCommand(options: { access?: "public" | "private" | "unlisted"; dryRun?: boolean }) {
  const spinner = ora("Validating skill manifest").start();
  const manifest = await readManifest();
  const packaged = await packageSkill(process.cwd(), manifest);
  spinner.text = `Packaged ${packaged.filePath}`;

  if (options.dryRun) {
    spinner.succeed(`Dry run complete: ${packaged.filePath} (${packaged.size} bytes)`);
    return;
  }

  const client = await apiClient();
  spinner.text = "Uploading package to registry storage";
  const uploadForm = new FormData();
  uploadForm.set("name", manifest.name);
  uploadForm.set("version", manifest.version);
  uploadForm.set(
    "file",
    new Blob([await fs.readFile(packaged.filePath)], { type: "application/octet-stream" }),
    `${manifest.name}-${manifest.version}.skill`
  );

  const { data: upload } = await client.post<{ file_url: string }>("/uploads/skills", uploadForm);
  spinner.text = "Publishing skill metadata";
  const payload = {
    ...manifest,
    visibility: options.access ?? manifest.visibility,
    file_size: packaged.size,
    file_url: upload.file_url
  };
  const { data } = await client.post("/skills", payload);
  spinner.succeed(`Published ${data.name}@${data.version}`);
  console.log(`Package: ${await fs.realpath(packaged.filePath)}`);
}
