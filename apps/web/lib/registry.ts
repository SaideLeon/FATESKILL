import { unstable_noStore as noStore } from "next/cache";
import { z } from "zod";
import { sampleSkills } from "./sample-data";
import { getSupabaseAdmin } from "./supabase";
import { getSupabaseUserScoped } from "./supabase-user-scoped";
import type { SearchParams, SkillDetail, SkillSummary, SkillVersion } from "./types";

const httpUrlSchema = z.string().max(300).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "URL must be http(s) and at most 300 characters");

export const publishSkillSchema = z.object({
  name: z.string().min(2).max(60).regex(/^[a-z0-9][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  description: z.string().min(8).max(2000),
  author: z.string().min(2).max(60),
  visibility: z.enum(["public", "private", "unlisted"]).default("public"),
  category: z.string().max(60).optional().default("uncategorized"),
  tags: z.array(z.string().min(1).max(30)).max(10).default([]),
  ai: z.array(z.string().max(20)).max(5).default(["claude"]),
  repository: httpUrlSchema.optional().nullable(),
  homepage: httpUrlSchema.optional().nullable(),
  changelog: z.string().max(10_000).optional().nullable(),
  file_url: httpUrlSchema.optional(),
  file_size: z.number().int().positive().max(50 * 1024 * 1024).optional()
}).strict();

const SEARCH_QUERY_MAX_LENGTH = 100;

function sanitizeSearchQuery(value: string) {
  return value
    .slice(0, SEARCH_QUERY_MAX_LENGTH)
    .replace(/[,()."]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .trim();
}

export function parseSearchParams(searchParams: URLSearchParams): SearchParams {
  return {
    q: searchParams.get("q") ?? undefined,
    tag: searchParams.get("tag") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    author: searchParams.get("author") ?? undefined,
    sort: (searchParams.get("sort") as SearchParams["sort"]) ?? "recent",
    page: Number(searchParams.get("page") ?? 1),
    limit: Math.min(Number(searchParams.get("limit") ?? 20), 100)
  };
}

export async function listSkills(params: SearchParams = {}): Promise<{ data: SkillSummary[]; page: number; limit: number; total: number }> {
  noStore();
  const page = Math.max(params.page ?? 1, 1);
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const sortColumn = params.sort === "downloads" ? "downloads" : params.sort === "stars" ? "stars" : "updated_at";
    const from = (page - 1) * limit;
    const to = page * limit - 1;

    const buildQuery = (searchMode: "full-text" | "contains") => {
      let query = supabase
        .from("skills_public_view")
        .select("*", { count: "exact" });

      if (params.q) {
        const safeQ = sanitizeSearchQuery(params.q);
        if (safeQ && searchMode === "full-text") {
          query = query.textSearch("search_vector", safeQ, { type: "websearch" });
        } else if (safeQ) {
          const pattern = `%${safeQ}%`;
          const filters = [
            `name.ilike.${JSON.stringify(pattern)}`,
            `description.ilike.${JSON.stringify(pattern)}`,
            `author.ilike.${JSON.stringify(pattern)}`
          ];
          query = query.or(filters.join(","));
        }
      }

      if (params.tag) query = query.contains("tags", [params.tag]);
      if (params.category) query = query.eq("category", params.category);
      if (params.author) query = query.eq("author", params.author);

      return query.order(sortColumn, { ascending: false }).range(from, to);
    };

    let { data, error, count } = await buildQuery("full-text");
    if (error) throw new Error(error.message);

    if (params.q && (data ?? []).length === 0) {
      ({ data, error, count } = await buildQuery("contains"));
      if (error) throw new Error(error.message);
    }

    return { data: (data ?? []) as SkillSummary[], page, limit, total: count ?? 0 };
  }

  let data = sampleSkills.filter((skill) => skill.visibility === "public");
  if (params.q) {
    const q = params.q.toLowerCase();
    data = data.filter((skill) => [skill.name, skill.description, skill.author, ...skill.tags].join(" ").toLowerCase().includes(q));
  }
  if (params.tag) data = data.filter((skill) => skill.tags.includes(params.tag!));
  if (params.category) data = data.filter((skill) => skill.category === params.category);
  if (params.author) data = data.filter((skill) => skill.author === params.author);

  data = data.sort((a, b) => {
    if (params.sort === "downloads") return b.downloads - a.downloads;
    if (params.sort === "stars") return b.stars - a.stars;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });

  const total = data.length;
  return { data: data.slice((page - 1) * limit, page * limit), page, limit, total };
}

export async function getSkill(name: string): Promise<SkillDetail | null> {
  noStore();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase.from("skills_public_view").select("*").eq("name", name).single();
    if (error) return null;
    return data as SkillDetail;
  }
  return sampleSkills.find((skill) => skill.name === name || skill.slug === name) ?? null;
}


export async function getSkillOwnerInfo(name: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("skills")
    .select("id, name, author_id, visibility")
    .eq("name", name)
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; name: string; author_id: string; visibility: string };
}

export async function getSkillForViewer(name: string, viewerUserId?: string | null): Promise<SkillDetail | null> {
  noStore();
  const publicSkill = await getSkill(name);
  if (publicSkill) return publicSkill;

  const supabase = getSupabaseAdmin();
  if (!supabase || !viewerUserId) return null;

  const { data, error } = await supabase
    .from("skills")
    .select(`
      id, name, slug, description, visibility, downloads, stars, tags, category, ai_targets,
      repository, homepage, updated_at, author_id,
      skill_versions(id, version, file_url, instructions, is_latest)
    `)
    .eq("name", name)
    .eq("author_id", viewerUserId)
    .eq("skill_versions.is_latest", true)
    .maybeSingle();

  if (error || !data) return null;

  const versions = ((data.skill_versions ?? []) as { id?: string; version: string; file_url?: string; instructions?: string; is_latest?: boolean }[]);
  const latestVersion = versions[0];

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    version: latestVersion?.version ?? "0.0.0",
    version_id: latestVersion?.id,
    description: data.description,
    author: "you",
    visibility: data.visibility,
    downloads: data.downloads,
    stars: data.stars,
    tags: data.tags ?? [],
    category: data.category ?? "uncategorized",
    ai_targets: data.ai_targets ?? [],
    repository: data.repository,
    homepage: data.homepage,
    updated_at: data.updated_at,
    entry_url: `/api/v1/skills/${data.name}/content/SKILL.md`,
    download_url: latestVersion?.file_url ?? `/api/v1/skills/${data.name}/download`,
    versions: versions.map((version) => version.version),
    instructions: latestVersion?.instructions
  } as SkillDetail;
}

export async function getSkillVersion(name: string, version: string): Promise<(SkillDetail & { requested_version: string }) | null> {
  const skill = await getSkill(name);
  if (!skill || !skill.versions.includes(version)) return null;
  return { ...skill, version, requested_version: version };
}


export async function getSkillVersions(name: string): Promise<SkillVersion[] | null> {
  const skill = await getSkill(name);
  if (!skill) return null;
  return skill.versions.map((version) => ({
    id: version === skill.version ? skill.version_id : undefined,
    version,
    file_url: skill.download_url,
    is_latest: version === skill.version,
    published_at: skill.updated_at
  }));
}

export async function recordInstall(name: string, source: "cli" | "api" | "web" = "api", userId?: string | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const skill = await getSkill(name);
  if (!skill?.id || !skill.version_id) return;
  await supabase.from("skill_installs").insert({
    skill_id: skill.id,
    version_id: skill.version_id,
    user_id: userId ?? null,
    source
  });
  await supabase.rpc("increment_skill_downloads", { p_skill_id: skill.id });
}

export async function publishSkill(input: unknown, auth?: string | { userId: string; accessToken?: string }) {
  const payload = publishSkillSchema.parse(input);
  const userId = typeof auth === "string" ? auth : auth?.userId;
  const supabase = auth && typeof auth !== "string" && auth.accessToken ? getSupabaseUserScoped(auth.accessToken) : getSupabaseAdmin();
  if (!supabase) {
    return {
      ...payload,
      slug: payload.name,
      downloads: 0,
      stars: 0,
      ai_targets: payload.ai,
      updated_at: new Date().toISOString(),
      dry_run: true
    };
  }

  if (!userId) throw new Error("UNAUTHENTICATED");

  const { data: existingSkill, error: existingError } = await supabase
    .from("skills")
    .select("id,name,slug,author_id")
    .eq("name", payload.name)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existingSkill?.author_id && existingSkill.author_id !== userId) {
    throw new Error("FORBIDDEN: skill já pertence a outro autor");
  }

  // ⚠️ NUNCA substituir este objecto por `...payload` ou `...body` directo no
  // upsert/insert do Supabase. Cada campo escrito deve estar listado
  // explicitamente aqui. Ver R18 no blueprint de segurança.
  const skillMutation = {
    name: payload.name,
    slug: payload.name,
    author_id: userId,
    description: payload.description,
    visibility: payload.visibility,
    category: payload.category,
    tags: payload.tags,
    ai_targets: payload.ai,
    repository: payload.repository ?? null,
    homepage: payload.homepage ?? null,
    updated_at: new Date().toISOString()
  };

  const { data: skill, error: skillError } = existingSkill
    ? await supabase
      .from("skills")
      .update(skillMutation)
      .eq("id", existingSkill.id)
      .select("id,name,slug,author_id")
      .single()
    : await supabase
      .from("skills")
      .insert(skillMutation)
      .select("id,name,slug,author_id")
      .single();

  if (skillError) throw new Error(skillError.message);

  await supabase.from("skill_versions").update({ is_latest: false }).eq("skill_id", skill.id);
  const { error: versionError } = await supabase.from("skill_versions").upsert({
    skill_id: skill.id,
    version: payload.version,
    changelog: payload.changelog,
    file_url: payload.file_url ?? "https://example.invalid/upload-pending.skill",
    file_size: payload.file_size,
    is_latest: true
  }, { onConflict: "skill_id,version" });

  if (versionError) throw new Error(versionError.message);
  return { ...payload, slug: skill.slug };
}
