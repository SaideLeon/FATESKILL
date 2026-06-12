import { NextResponse } from "next/server";
import { getSkill } from "@/lib/registry";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const skill = await getSkill(name);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  return NextResponse.json({
    name: skill.name,
    trigger_description: skill.description,
    instructions: skill.instructions ?? `Carrega e segue o ficheiro SKILL.md da skill ${skill.name}.`,
    version: skill.version,
    ai_targets: skill.ai_targets
  });
}
