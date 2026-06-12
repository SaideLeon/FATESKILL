import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const rawToken = `shb_${randomBytes(24).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  return NextResponse.json({
    id: crypto.randomUUID(),
    name: body.name ?? "default",
    scopes: body.scopes ?? ["read"],
    token: rawToken,
    token_hash_preview: tokenHash.slice(0, 12),
    created_at: new Date().toISOString()
  }, { status: 201 });
}
