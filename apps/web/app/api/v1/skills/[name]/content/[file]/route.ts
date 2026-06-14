import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { getSkillForViewer } from "@/lib/registry";

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string; file: string }> }) {
  const { name, file } = await params;
  const auth = await resolveApiUser(request).catch(() => null);
  const skill = await getSkillForViewer(name, auth?.userId ?? null);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  if (file !== "SKILL.md") return NextResponse.json({ error: "Only SKILL.md content is exposed by this endpoint" }, { status: 404 });

  return new NextResponse(`# ${skill.name}\n\n${skill.instructions ?? skill.description}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" }
  });
}
