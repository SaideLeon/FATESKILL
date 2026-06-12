import Link from "next/link";
import { listSkills } from "@/lib/registry";

export default async function SkillsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const tag = typeof params.tag === "string" ? params.tag : undefined;
  const category = typeof params.category === "string" ? params.category : undefined;
  const sort = params.sort === "downloads" || params.sort === "stars" || params.sort === "recent" ? params.sort : "recent";
  const { data, total } = await listSkills({ q, tag, category, sort });

  return (
    <section className="container">
      <p className="eyebrow">Registry</p>
      <h1>Skills públicas</h1>
      <form className="filters">
        <input name="q" placeholder="Pesquisar por texto" defaultValue={q} />
        <input name="tag" placeholder="Tag" defaultValue={tag} />
        <select name="sort" defaultValue={sort}>
          <option value="recent">Recentes</option>
          <option value="downloads">Downloads</option>
          <option value="stars">Stars</option>
        </select>
        <button type="submit">Pesquisar</button>
      </form>
      <p>{total} skill(s) encontradas.</p>
      <div className="card-grid">
        {data.map((skill) => (
          <Link key={skill.name} href={`/skills/${skill.name}`} className="card">
            <h3>{skill.name}</h3>
            <p>{skill.description}</p>
            <div className="tags">{skill.tags.map((skillTag) => <span className="tag" key={skillTag}>{skillTag}</span>)}</div>
            <div className="stats"><span>↓ {skill.downloads}</span><span>★ {skill.stars}</span><span>@{skill.author}</span></div>
          </Link>
        ))}
      </div>
    </section>
  );
}
