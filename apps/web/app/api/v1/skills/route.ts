import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limit";
import { listSkills, parseSearchParams, publishSkill } from "@/lib/registry";

export async function GET(request: NextRequest) {
  const result = await listSkills(parseSearchParams(request.nextUrl.searchParams));
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.scopes.includes("publish")) return NextResponse.json({ error: "Token missing 'publish' scope" }, { status: 403 });

  const limited = await enforceRateLimit(request, "publish", auth.userId);
  if (limited) return limited;

  const contentType = request.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries((await request.formData()).entries());

  const normalized = typeof body.tags === "string"
    ? { ...body, tags: body.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean) }
    : body;

  try {
    const skill = await publishSkill(normalized, { userId: auth.userId, accessToken: auth.accessToken });
    return NextResponse.json(skill, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload", details: error.flatten() }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Publish failed";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("FORBIDDEN") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
