import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getSupabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const { email, redirectTo } = await request.json().catch(() => ({}));
  if (typeof email !== "string" || email.length > 254) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  const limited = await enforceRateLimit(request, "auth", email.toLowerCase());
  if (limited) return limited;
  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: typeof redirectTo === "string" ? redirectTo : undefined } });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
