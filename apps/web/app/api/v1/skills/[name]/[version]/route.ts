import { NextResponse } from "next/server";
import { getSkillVersion } from "@/lib/registry";

export async function GET(_: Request, { params }: { params: Promise<{ name: string; version: string }> }) {
  const { name, version } = await params;
  const skill = await getSkillVersion(name, version);
  if (!skill) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  return NextResponse.json(skill);
}
