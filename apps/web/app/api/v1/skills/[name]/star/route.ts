import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { getSkillForViewer } from "@/lib/registry";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ name, starred: true, dry_run: true });

  const skill = await getSkillForViewer(name, auth.userId);
  if (!skill?.id) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  const { error: insertError } = await supabase.from("skill_stars").insert({ user_id: auth.userId, skill_id: skill.id });
  if (insertError && insertError.code !== "23505") return NextResponse.json({ error: insertError.message }, { status: 500 });
  if (!insertError) await supabase.rpc("increment_skill_stars", { p_skill_id: skill.id });

  return NextResponse.json({ name, starred: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ name, starred: false, dry_run: true });

  const skill = await getSkillForViewer(name, auth.userId);
  if (!skill?.id) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

  const { error: deleteError, count } = await supabase
    .from("skill_stars")
    .delete({ count: "exact" })
    .eq("user_id", auth.userId)
    .eq("skill_id", skill.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  if (count && count > 0) await supabase.rpc("decrement_skill_stars", { p_skill_id: skill.id });

  return NextResponse.json({ name, starred: false });
}
