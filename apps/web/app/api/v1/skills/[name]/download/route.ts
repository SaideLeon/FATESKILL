import { NextResponse } from "next/server";
import { getSkill, recordInstall } from "@/lib/registry";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const skill = await getSkill(name);
  if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  await recordInstall(name, "api");

  if (skill.download_url.startsWith("http")) {
    return NextResponse.redirect(skill.download_url);
  }

  return new NextResponse(`FateSkill package placeholder for ${skill.name}@${skill.version}\n`, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${skill.name}-${skill.version}.skill"`
    }
  });
}
