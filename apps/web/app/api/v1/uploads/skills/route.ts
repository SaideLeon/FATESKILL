import { NextResponse } from "next/server";
import { uploadSkillPackage } from "@/lib/storage";

export async function POST(request: Request) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "");
  const version = String(form.get("version") ?? "");
  const file = form.get("file");

  if (!name || !version || !(file instanceof File)) {
    return NextResponse.json({ error: "name, version and file are required" }, { status: 400 });
  }

  try {
    const upload = await uploadSkillPackage({ name, version, file });
    return NextResponse.json({ file_url: upload.publicUrl, path: upload.path }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 500 });
  }
}
