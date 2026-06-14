import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { getSkillForViewer } from "@/lib/registry";

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string; version: string }> }) {
  const { name, version } = await params;
  const auth = await resolveApiUser(request).catch(() => null);
  const skill = await getSkillForViewer(name, auth?.userId ?? null);
  if (!skill || !skill.versions.includes(version)) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  return NextResponse.json({ ...skill, version, requested_version: version });
}
