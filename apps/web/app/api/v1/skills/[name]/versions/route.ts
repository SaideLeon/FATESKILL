import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { getSkillForViewer } from "@/lib/registry";

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request).catch(() => null);
  const skill = await getSkillForViewer(name, auth?.userId ?? null);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  return NextResponse.json({ data: skill.versions.map((version) => ({
    id: version === skill.version ? skill.version_id : undefined,
    version,
    file_url: skill.download_url,
    is_latest: version === skill.version,
    published_at: skill.updated_at
  })) });
}
