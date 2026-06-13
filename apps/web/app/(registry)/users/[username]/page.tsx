import { listSkills } from "@/lib/registry";

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { data } = await listSkills({ author: username });
  return (
    <section className="container">
      <p className="eyebrow">Perfil público</p>
      <h1>@{username}</h1>
      <p>{data.length} skill(s) publicadas no FateSkill.</p>
      <div className="card-grid">
        {data.map((skill) => <article className="card" key={skill.name}><h3>{skill.name}</h3><p>{skill.description}</p></article>)}
      </div>
    </section>
  );
}
