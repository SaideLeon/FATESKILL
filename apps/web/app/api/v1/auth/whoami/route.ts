import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const admin = getSupabaseAdmin();
  let username = "anonymous";
  if (admin) {
    const { data } = await admin.from("profiles").select("username").eq("id", auth.userId).single();
    username = data?.username ?? "anonymous";
  }

  return NextResponse.json({ username, scopes: auth.scopes, via: auth.via });
}
