import { NextResponse } from "next/server";
import { getSkill } from "@/lib/registry";

export async function GET(_: Request, { params }: { params: Promise<{ name: string; file: string }> }) {
  const { name, file } = await params;
  const skill = await getSkill(name);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  if (file !== "SKILL.md") return NextResponse.json({ error: "Only SKILL.md content is exposed by this endpoint" }, { status: 404 });

  return new NextResponse(`# ${skill.name}\n\n${skill.instructions ?? skill.description}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" }
  });
}
