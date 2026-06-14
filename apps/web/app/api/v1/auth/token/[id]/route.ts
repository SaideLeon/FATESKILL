import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { error, count } = await supabase.from("api_tokens").delete({ count: "exact" }).eq("id", id).eq("user_id", auth.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Token not found" }, { status: 404 });
  return NextResponse.json({ id, revoked: true });
}
