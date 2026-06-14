import path from "node:path";
import fs from "fs-extra";
import semver from "semver";
import { z } from "zod";

const httpUrlSchema = z.string().max(300).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "URL must be http(s) and at most 300 characters");

export const skillManifestSchema = z.object({
  name: z.string().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.string().refine((value: string) => semver.valid(value) !== null, "version must be valid semver"),
  description: z.string().min(8).max(2000),
  author: z.string().min(2).max(60),
  license: z.string().max(40).default("MIT"),
  visibility: z.enum(["public", "private", "unlisted"]).default("public"),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  ai: z.array(z.string().max(20)).max(5).default(["claude"]),
  category: z.string().max(60).default("uncategorized"),
  entry: z.string().max(120).default("SKILL.md"),
  engines: z.record(z.string().max(20)).optional(),
  repository: httpUrlSchema.optional(),
  homepage: httpUrlSchema.optional()
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
