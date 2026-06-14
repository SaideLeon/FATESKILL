import Link from "next/link";

export default function HomePage() {
  return (
    <>
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
fateskill search "vulnerabilidade"
fateskill install security-audit
fateskill install security-audit@1.1.1
fateskill info security-audit`}</pre>
        </div>
      </section>

      <section className="container motivation">
        <div>
          <p className="eyebrow">Porque existe</p>
          <h2>Vibe coding precisa de skills partilháveis, não de recomeços constantes.</h2>
          <p>
            Quando programamos com agentes de IA, muitas vezes sabemos o resultado que queremos, mas perdemo-nos a procurar prompts, contextos, scripts e padrões certos para lá chegar. FateSkill nasceu para transformar esse conhecimento disperso em habilidades seguras, versionadas e fáceis de reutilizar.
          </p>
        </div>

        <div className="card-grid motivation-grid">
          <article className="card">
            <span className="motivation-icon">🧭</span>
            <h3>Menos perdido</h3>
            <p>Encontra a skill certa para guiar o agente, combinar capacidades e avançar com mais clareza.</p>
          </article>
          <article className="card">
            <span className="motivation-icon">🤝</span>
            <h3>Conhecimento em rede</h3>
            <p>Publica o que aprendeste e reutiliza habilidades criadas por outras pessoas, equipas e comunidades.</p>
          </article>
          <article className="card">
            <span className="motivation-icon">🔒</span>
            <h3>Partilha segura</h3>
            <p>Um repositório central para fazer upload, baixar e versionar skills com autoria, tokens e rastreabilidade.</p>
          </article>
        </div>
      </section>
    </>
  );
}
