import { NextResponse } from "next/server";
import { listSkills } from "@/lib/registry";

export async function GET(_: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { data } = await listSkills({ author: username });
  return NextResponse.json({ username, verified: username === "saide", skills_count: data.length });
}
