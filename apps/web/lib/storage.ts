import { getSupabaseAdmin } from "./supabase";

const SKILL_PACKAGES_BUCKET = process.env.SUPABASE_SKILL_PACKAGES_BUCKET ?? "skill-packages";
export const MAX_SKILL_FILE_SIZE = 20 * 1024 * 1024;
const ZIP_MAGIC_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function isZipBuffer(buffer: Buffer) {
  return buffer.length >= 4 && buffer.subarray(0, 4).equals(ZIP_MAGIC_BYTES);
}

export async function uploadSkillPackage(params: { name: string; version: string; file: File }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error("Supabase storage is not configured");
  }

  if (params.file.size > MAX_SKILL_FILE_SIZE) {
    throw new Error(`File too large: max ${MAX_SKILL_FILE_SIZE / (1024 * 1024)}MB`);
  }

  const safeName = params.name.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const safeVersion = params.version.replace(/[^0-9A-Za-z.+-]/g, "-");
  const path = `${safeName}/${safeVersion}/${safeName}-${safeVersion}.skill`;
  const buffer = Buffer.from(await params.file.arrayBuffer());
  if (!isZipBuffer(buffer)) {
    throw new Error("Invalid .skill package: file is not a valid ZIP archive");
  }

  const { error } = await supabase.storage
    .from(SKILL_PACKAGES_BUCKET)
    .upload(path, buffer, {
      contentType: "application/zip",
      upsert: true
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(SKILL_PACKAGES_BUCKET).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}
