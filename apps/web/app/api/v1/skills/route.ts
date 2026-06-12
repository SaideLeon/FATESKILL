import { NextRequest, NextResponse } from "next/server";
import { listSkills, parseSearchParams, publishSkill } from "@/lib/registry";

export async function GET(request: NextRequest) {
  const result = await listSkills(parseSearchParams(request.nextUrl.searchParams));
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries((await request.formData()).entries());

  const normalized = typeof body.tags === "string"
    ? { ...body, tags: body.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean) }
    : body;

  const skill = await publishSkill(normalized);
  return NextResponse.json(skill, { status: 201 });
}
