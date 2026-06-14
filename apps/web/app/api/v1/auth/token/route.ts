import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const ALLOWED_SCOPES = ["read", "publish", "admin"] as const;

export async function POST(request: NextRequest) {
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const requestedScopes: string[] = Array.isArray(body.scopes) && body.scopes.length > 0 ? body.scopes : ["read"];
  const scopes = requestedScopes.filter((scope) => (ALLOWED_SCOPES as readonly string[]).includes(scope));
  if (scopes.length === 0) return NextResponse.json({ error: "Invalid scopes" }, { status: 400 });
  if (scopes.includes("admin") && auth.via !== "cookie") {
    return NextResponse.json({ error: "Only browser sessions can mint admin tokens" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const rawToken = `shb_${randomBytes(24).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const name = typeof body.name === "string" && body.name.length > 0 ? body.name : "default";
  const expiresAt = typeof body.expires_at === "string" ? body.expires_at : null;

  const { data, error } = await supabase
    .from("api_tokens")
    .insert({ user_id: auth.userId, name, token_hash: tokenHash, scopes, expires_at: expiresAt })
    .select("id, name, scopes, created_at, expires_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, token: rawToken }, { status: 201 });
}
