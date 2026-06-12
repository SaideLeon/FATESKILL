import Link from "next/link";
import { notFound } from "next/navigation";
import { getSkill } from "@/lib/registry";

export default async function SkillDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const skill = await getSkill(name);
  if (!skill) notFound();

  return (
    <section className="container">
      <p className="eyebrow">{skill.category}</p>
      <h1>{skill.name}</h1>
      <p>{skill.description}</p>
      <div className="actions">
        <a href={skill.download_url} className="button">Download .skill</a>
        <a href={`/api/v1/skills/${skill.name}/ai-context`} className="button secondary">AI context</a>
      </div>
      <div className="card-grid">
        <article className="detail-panel">
          <h2>Instalação</h2>
          <pre>{`skillhub install ${skill.name}\nskillhub install ${skill.name}@${skill.version}`}</pre>
        </article>
        <article className="detail-panel">
          <h2>Metadados</h2>
          <p>Autor: <Link href={`/users/${skill.author}`}>@{skill.author}</Link></p>
          <p>Versão: {skill.version}</p>
          <p>Downloads: {skill.downloads} · Stars: {skill.stars}</p>
          <div className="tags">{skill.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
        </article>
      </div>
      <article className="detail-panel" style={{ marginTop: "1rem" }}>
        <h2>Instruções da skill</h2>
        <p>{skill.instructions ?? "As instruções ficam disponíveis no SKILL.md publicado."}</p>
      </article>
    </section>
  );
}
