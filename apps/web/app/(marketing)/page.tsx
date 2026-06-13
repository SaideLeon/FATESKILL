import Link from "next/link";

export default function HomePage() {
  return (
    <section className="container hero">
      <div>
        <p className="eyebrow">npm para skills de IA</p>
        <h1>Publica, descobre e instala skills para agentes de IA.</h1>
        <p>
          FateSkill combina um registo web, API REST e CLI Node.js para distribuir pacotes <code>.skill</code> com instruções, scripts, referências e assets reutilizáveis.
        </p>
        <div className="actions">
          <Link href="/skills" className="button">Explorar skills</Link>
          <Link href="/publish" className="button secondary">Publicar uma skill</Link>
        </div>
      </div>
      <div className="code-card">
        <pre>{`npm install -g fateskill-cli
fateskill search "docx academic"
fateskill install fofa-tabela-docx
fateskill info fofa-tabela-docx`}</pre>
      </div>
    </section>
  );
}
