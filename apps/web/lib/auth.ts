import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "./supabase";
import { getSupabaseServer } from "./supabase-server";

export type ApiAuth = {
  userId: string;
  scopes: string[];
  via: "cookie" | "token";
};

export async function resolveApiUser(request: NextRequest): Promise<ApiAuth | null> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const rawToken = authHeader.slice("Bearer ".length).trim();
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const { data, error } = await supabase
      .from("api_tokens")
      .select("user_id, scopes, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error || !data) return null;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

    await supabase.from("api_tokens").update({ last_used: new Date().toISOString() }).eq("token_hash", tokenHash);

    return { userId: data.user_id, scopes: data.scopes ?? ["read"], via: "token" };
  }

  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  return { userId: user.id, scopes: ["read", "publish", "admin"], via: "cookie" };
}
