import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/auth";
import { getSkillForViewer, recordInstall } from "@/lib/registry";

export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const auth = await resolveApiUser(request).catch(() => null);
  const skill = await getSkillForViewer(name, auth?.userId ?? null);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  const source = request.headers.get("user-agent")?.includes("fateskill-cli") ? "cli" : "api";
  await recordInstall(name, source, auth?.userId ?? null);

  if (skill.download_url.startsWith("http")) return NextResponse.redirect(skill.download_url);

  return new NextResponse(`FateSkill package placeholder for ${skill.name}@${skill.version}\n`, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${skill.name}-${skill.version}.skill"`
    }
  });
}
