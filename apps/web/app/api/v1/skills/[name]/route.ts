import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveApiUser } from "@/lib/auth";
import { getSkillForViewer, getSkillOwnerInfo } from "@/lib/registry";
import { getSupabaseAdmin } from "@/lib/supabase";

const httpUrlSchema = z.string().max(300).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "URL must be http(s) and at most 300 characters");

const updateSkillSchema = z.object({
  description: z.string().min(8).max(2000).optional(),
  category: z.string().max(60).optional(),
  tags: z.array(z.string().min(1).max(30)).max(10).optional(),
  visibility: z.enum(["public", "private", "unlisted"]).optional(),
  repository: httpUrlSchema.optional().nullable(),
  homepage: httpUrlSchema.optional().nullable()
}).strict();

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request).catch(() => null);
  const skill = await getSkillForViewer(name, auth?.userId ?? null);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  return NextResponse.json(skill);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.scopes.includes("publish")) return NextResponse.json({ error: "Token missing 'publish' scope" }, { status: 403 });

  const owner = await getSkillOwnerInfo(name);
  if (!owner) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  if (owner.author_id !== auth.userId) return NextResponse.json({ error: "Forbidden: not the owner of this skill" }, { status: 403 });

  const parsed = updateSkillSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("skills")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", owner.id)
    .select("name, description, category, tags, visibility, repository, homepage, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const owner = await getSkillOwnerInfo(name);
  if (!owner) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  if (owner.author_id !== auth.userId) return NextResponse.json({ error: "Forbidden: not the owner of this skill" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { error } = await supabase.from("skills").delete().eq("id", owner.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ name, deleted: true });
}
