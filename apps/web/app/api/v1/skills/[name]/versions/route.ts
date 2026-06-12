import { NextResponse } from "next/server";
import { getSkillVersions } from "@/lib/registry";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const versions = await getSkillVersions(name);
  if (!versions) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  return NextResponse.json({ data: versions });
}
