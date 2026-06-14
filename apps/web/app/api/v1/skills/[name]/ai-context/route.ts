import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { getSkillForViewer } from "@/lib/registry";

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request).catch(() => null);
  const skill = await getSkillForViewer(name, auth?.userId ?? null);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  return NextResponse.json({
    name: skill.name,
    trigger_description: skill.description,
    instructions: skill.instructions ?? `Carrega e segue o ficheiro SKILL.md da skill ${skill.name}.`,
    version: skill.version,
    ai_targets: skill.ai_targets
  });
}
