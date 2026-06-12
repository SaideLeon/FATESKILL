import { NextResponse } from "next/server";
import { listSkills } from "@/lib/registry";

export async function GET(_: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return NextResponse.json(await listSkills({ author: username }));
}
