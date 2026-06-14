import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { MAX_SKILL_FILE_SIZE, uploadSkillPackage } from "@/lib/storage";

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "publish");
  if (limited) return limited;
  const form = await request.formData();
  const name = String(form.get("name") ?? "");
  const version = String(form.get("version") ?? "");
  const file = form.get("file");

  if (!name || !version || !(file instanceof File)) {
    return NextResponse.json({ error: "name, version and file are required" }, { status: 400 });
  }

  if (file.size > MAX_SKILL_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds maximum allowed size (20MB)" }, { status: 413 });
  }

  try {
    const upload = await uploadSkillPackage({ name, version, file });
    return NextResponse.json({ file_url: upload.publicUrl, path: upload.path }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: error instanceof Error && /too large|invalid \.skill|not a valid ZIP/i.test(error.message) ? 400 : 500 });
  }
}
