export default function PublishPage() {
  return (
    <section className="container">
      <p className="eyebrow">Publicar</p>
      <h1>Registe uma nova skill</h1>
      <form className="form-grid" action="/api/v1/skills" method="post">
        <input name="name" placeholder="fofa-tabela-docx" required />
        <input name="version" placeholder="1.0.0" required />
        <textarea name="description" placeholder="Descrição" required />
        <input name="author" placeholder="username" required />
        <input name="category" placeholder="document-processing" />
        <input name="tags" placeholder="docx,academic,mozambique" />
        <button type="submit">Publicar metadados</button>
      </form>
    </section>
  );
}
