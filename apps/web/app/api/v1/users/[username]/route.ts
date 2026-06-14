import { NextResponse } from "next/server";
import { listSkills } from "@/lib/registry";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, verified")
      .eq("username", username)
      .maybeSingle();

    if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { data } = await listSkills({ author: username });
    return NextResponse.json({ username: profile.username, verified: profile.verified ?? false, skills_count: data.length });
  }

  const { data } = await listSkills({ author: username });
  if (data.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ username, verified: username === "saide", skills_count: data.length });
}
