import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getSupabaseServer } from "@/lib/supabase-server";

export default async function DashboardPage() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = getSupabaseAdmin();
  let mySkills: { name: string; version: string; downloads: number; stars: number; visibility: string }[] = [];

  if (admin && user) {
    const { data } = await admin
      .from("skills")
      .select("name, downloads, stars, visibility, skill_versions!inner(version, is_latest)")
      .eq("author_id", user.id)
      .eq("skill_versions.is_latest", true);

    mySkills = (data ?? []).map((row) => ({
      name: row.name,
      version: (row.skill_versions as unknown as { version: string }[])[0]?.version ?? "—",
      downloads: row.downloads,
      stars: row.stars,
      visibility: row.visibility
    }));
  }

  return (
    <section className="container">
      <p className="eyebrow">Área autenticada</p>
      <h1>Dashboard do autor</h1>
      <p>Sessão: {user?.email ?? "anónimo (Supabase não configurado)"}</p>
      <div className="card-grid">
        {mySkills.length === 0 && <p>Ainda não publicaste nenhuma skill.</p>}
        {mySkills.map((skill) => (
          <Link key={skill.name} href={`/skills/${skill.name}`} className="card">
            <h3>{skill.name}@{skill.version}</h3>
            <p>Visibilidade: {skill.visibility}</p>
            <div className="stats"><span>↓ {skill.downloads}</span><span>★ {skill.stars}</span></div>
          </Link>
        ))}
      </div>
      <Link href="/publish" className="button" style={{ marginTop: "2rem" }}>Publicar nova skill</Link>
    </section>
  );
}
