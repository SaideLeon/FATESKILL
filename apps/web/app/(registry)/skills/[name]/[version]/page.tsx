import { notFound } from "next/navigation";
import { getSkillVersion } from "@/lib/registry";

export default async function SkillVersionPage({ params }: { params: Promise<{ name: string; version: string }> }) {
  const { name, version } = await params;
  const skill = await getSkillVersion(name, version);
  if (!skill) notFound();

  return (
    <section className="container">
      <p className="eyebrow">Versão específica</p>
      <h1>{skill.name}@{skill.requested_version}</h1>
      <p>{skill.description}</p>
      <a href={skill.download_url} className="button">Download desta versão</a>
    </section>
  );
}
