import { getSupabaseAdmin } from "./supabase";

const SKILL_PACKAGES_BUCKET = process.env.SUPABASE_SKILL_PACKAGES_BUCKET ?? "skill-packages";

export async function uploadSkillPackage(params: { name: string; version: string; file: File }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase storage is not configured");
  }

  const safeName = params.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const safeVersion = params.version.replace(/[^0-9A-Za-z.+-]/g, "-");
  const path = `${safeName}/${safeVersion}/${safeName}-${safeVersion}.skill`;
  const buffer = Buffer.from(await params.file.arrayBuffer());

  const { error } = await supabase.storage
    .from(SKILL_PACKAGES_BUCKET)
    .upload(path, buffer, {
      contentType: params.file.type || "application/octet-stream",
      upsert: true
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(SKILL_PACKAGES_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}
