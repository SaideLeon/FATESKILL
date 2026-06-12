import path from "node:path";
import fs from "fs-extra";
import semver from "semver";
import { z } from "zod";

export const skillManifestSchema = z.object({
  name: z.string().min(2).regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.string().refine((value: string) => semver.valid(value) !== null, "version must be valid semver"),
  description: z.string().min(8),
  author: z.string().min(2),
  license: z.string().default("MIT"),
  visibility: z.enum(["public", "private", "unlisted"]).default("public"),
  tags: z.array(z.string()).default([]),
  ai: z.array(z.string()).default(["claude"]),
  category: z.string().default("uncategorized"),
  entry: z.string().default("SKILL.md"),
  engines: z.record(z.string()).optional(),
  repository: z.string().url().optional(),
  homepage: z.string().url().optional()
});

export type SkillManifest = z.infer<typeof skillManifestSchema>;

export async function readManifest(directory = process.cwd()): Promise<SkillManifest> {
  const manifestPath = path.join(directory, "skill.json");
  const manifest = await fs.readJson(manifestPath);
  const parsed = skillManifestSchema.parse(manifest);
  const entryPath = path.join(directory, parsed.entry);
  if (!(await fs.pathExists(entryPath))) {
    throw new Error(`Entry file not found: ${parsed.entry}`);
  }
  return parsed;
}
