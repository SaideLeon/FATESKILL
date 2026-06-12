export default function DashboardPage() {
  return (
    <section className="container">
      <p className="eyebrow">Área autenticada</p>
      <h1>Dashboard do autor</h1>
      <div className="card-grid">
        <article className="card"><h3>Publicações</h3><p>Acompanhe versões, visibilidade e metadados das suas skills.</p></article>
        <article className="card"><h3>Analytics</h3><p>Visualize instalações por origem, versão e período.</p></article>
        <article className="card"><h3>Tokens</h3><p>Crie tokens com scopes de leitura, publicação ou administração.</p></article>
      </div>
    </section>
  );
}
