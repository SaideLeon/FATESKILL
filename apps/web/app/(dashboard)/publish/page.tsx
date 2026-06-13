"use client";

import { useCallback, useRef, useState } from "react";

type PublishStep = "form" | "uploading" | "done" | "error";

export default function PublishPage() {
  const [step, setStep] = useState<PublishStep>("form");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [manifest, setManifest] = useState({
    name: "",
    version: "",
    description: "",
    author: "",
    category: "",
    tags: "",
    visibility: "public",
  });
  const [result, setResult] = useState<{
    name?: string;
    version?: string;
    error?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (selectedFile: File) => {
    if (!selectedFile.name.endsWith(".skill")) {
      setResult({ error: "O ficheiro deve ter extensão .skill" });
      return;
    }

    setFile(selectedFile);

    const baseName = selectedFile.name.replace(".skill", "");
    const match = baseName.match(/^(.+)-(\d+\.\d+\.\d+.*)$/);

    if (match) {
      const [, skillName, skillVersion] = match;

      setManifest((previous) => ({
        ...previous,
        name: previous.name || skillName || "",
        version: previous.version || skillVersion || "",
      }));
    }
  };

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);

    const selectedFile = event.dataTransfer.files[0];

    if (selectedFile) {
      handleFile(selectedFile);
    }
  }, []);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];

    if (selectedFile) {
      handleFile(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      return;
    }

    if (!manifest.name || !manifest.version || !manifest.description || !manifest.author) {
      setResult({ error: "Preenche todos os campos obrigatórios." });
      return;
    }

    setStep("uploading");

    try {
      const uploadForm = new FormData();
      uploadForm.set("name", manifest.name);
      uploadForm.set("version", manifest.version);
      uploadForm.set("file", file, file.name);

      const uploadResponse = await fetch("/api/v1/uploads/skills", {
        method: "POST",
        body: uploadForm,
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json().catch(() => ({}));
        throw new Error(error.error ?? `Upload falhou: ${uploadResponse.status}`);
      }

      const { file_url: fileUrl } = await uploadResponse.json();
      const skillPayload = {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        category: manifest.category || "uncategorized",
        tags: manifest.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        visibility: manifest.visibility,
        file_url: fileUrl,
        file_size: file.size,
      };

      const publishResponse = await fetch("/api/v1/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skillPayload),
      });

      if (!publishResponse.ok) {
        const error = await publishResponse.json().catch(() => ({}));
        throw new Error(error.error ?? `Publicação falhou: ${publishResponse.status}`);
      }

      const data = await publishResponse.json();
      setResult({ name: data.name, version: data.version ?? manifest.version });
      setStep("done");
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Erro desconhecido" });
      setStep("error");
    }
  };

  const reset = () => {
    setStep("form");
    setFile(null);
    setResult(null);
    setManifest({
      name: "",
      version: "",
      description: "",
      author: "",
      category: "",
      tags: "",
      visibility: "public",
    });
  };

  return (
    <section className="container">
      <p className="eyebrow">Publicar</p>
      <h1>Registe uma nova skill</h1>

      {step === "done" && result && (
        <div className="publish-success">
          <p style={{ color: "var(--brand)", fontSize: "1.1rem", fontWeight: 700 }}>
            ✓ {result.name}@{result.version} publicado com sucesso!
          </p>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
            <a href={`/skills/${result.name}`} className="button">
              Ver skill
            </a>
            <button onClick={reset} className="button secondary" type="button">
              Publicar outra
            </button>
          </div>
        </div>
      )}

      {step === "error" && result?.error && (
        <div className="publish-error">
          <p style={{ color: "#f87171" }}>✗ {result.error}</p>
          <button
            onClick={() => {
              setStep("form");
              setResult(null);
            }}
            className="button secondary"
            style={{ marginTop: "1rem" }}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {(step === "form" || step === "uploading") && (
        <div className="publish-layout">
          <div
            className={`drop-zone${dragOver ? " drag-over" : ""}${file ? " has-file" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".skill"
              onChange={onFileChange}
              style={{ display: "none" }}
            />
            {file ? (
              <>
                <span className="drop-icon">📦</span>
                <p className="drop-label">{file.name}</p>
                <p className="drop-hint">{(file.size / 1024).toFixed(1)} KB · Clica para trocar</p>
              </>
            ) : (
              <>
                <span className="drop-icon">⬆</span>
                <p className="drop-label">
                  Arrasta o teu ficheiro <code>.skill</code> aqui
                </p>
                <p className="drop-hint">ou clica para seleccionar</p>
              </>
            )}
          </div>

          <div className="form-grid">
            <div className="field-row">
              <label>
                Nome <span className="req">*</span>
              </label>
              <input
                name="name"
                placeholder="fofa-tabela-docx"
                value={manifest.name}
                onChange={(event) => setManifest((previous) => ({ ...previous, name: event.target.value }))}
                disabled={step === "uploading"}
              />
            </div>

            <div className="field-row">
              <label>
                Versão <span className="req">*</span>
              </label>
              <input
                name="version"
                placeholder="1.0.0"
                value={manifest.version}
                onChange={(event) => setManifest((previous) => ({ ...previous, version: event.target.value }))}
                disabled={step === "uploading"}
              />
            </div>

            <div className="field-row full">
              <label>
                Descrição <span className="req">*</span>
              </label>
              <textarea
                name="description"
                rows={3}
                placeholder="O que esta skill faz..."
                value={manifest.description}
                onChange={(event) => setManifest((previous) => ({ ...previous, description: event.target.value }))}
                disabled={step === "uploading"}
              />
            </div>

            <div className="field-row">
              <label>
                Autor <span className="req">*</span>
              </label>
              <input
                name="author"
                placeholder="username"
                value={manifest.author}
                onChange={(event) => setManifest((previous) => ({ ...previous, author: event.target.value }))}
                disabled={step === "uploading"}
              />
            </div>

            <div className="field-row">
              <label>Categoria</label>
              <input
                name="category"
                placeholder="document-processing"
                value={manifest.category}
                onChange={(event) => setManifest((previous) => ({ ...previous, category: event.target.value }))}
                disabled={step === "uploading"}
              />
            </div>

            <div className="field-row">
              <label>Tags</label>
              <input
                name="tags"
                placeholder="docx, academic, mozambique"
                value={manifest.tags}
                onChange={(event) => setManifest((previous) => ({ ...previous, tags: event.target.value }))}
                disabled={step === "uploading"}
              />
            </div>

            <div className="field-row">
              <label>Visibilidade</label>
              <select
                name="visibility"
                value={manifest.visibility}
                onChange={(event) => setManifest((previous) => ({ ...previous, visibility: event.target.value }))}
                disabled={step === "uploading"}
              >
                <option value="public">Público</option>
                <option value="unlisted">Não listado</option>
                <option value="private">Privado</option>
              </select>
            </div>

            <div className="field-row full" style={{ marginTop: "0.5rem" }}>
              <button
                onClick={handleSubmit}
                disabled={!file || step === "uploading"}
                className="button publish-btn"
                type="button"
              >
                {step === "uploading" ? "A publicar…" : "Publicar skill"}
              </button>
              {!file && (
                <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  Falta seleccionar o ficheiro .skill
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .publish-layout {
          display: grid;
          gap: 2rem;
          grid-template-columns: 1fr 1.5fr;
          align-items: start;
          margin-top: 2rem;
        }
        .drop-zone {
          border: 2px dashed var(--border);
          border-radius: 24px;
          padding: 3rem 2rem;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
          background: var(--panel);
        }
        .drop-zone:hover, .drop-zone.drag-over {
          border-color: var(--brand-strong);
          background: rgba(56, 189, 248, 0.06);
        }
        .drop-zone.has-file {
          border-color: var(--brand);
          border-style: solid;
        }
        .drop-icon { font-size: 2.5rem; display: block; margin-bottom: 1rem; }
        .drop-label { color: var(--text); font-weight: 600; margin: 0; }
        .drop-hint { color: var(--muted); font-size: 0.9rem; margin: 0.4rem 0 0; }
        .form-grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: 1fr 1fr;
        }
        .field-row { display: flex; flex-direction: column; gap: 0.4rem; }
        .field-row.full { grid-column: 1 / -1; }
        .field-row label { color: var(--muted); font-size: 0.85rem; font-weight: 600; }
        .field-row input, .field-row textarea, .field-row select {
          width: 100%;
        }
        .req { color: var(--brand-strong); }
        .publish-btn { width: 100%; justify-content: center; font-size: 1rem; padding: 1rem; }
        .publish-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .publish-success, .publish-error {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 2rem;
          margin-top: 2rem;
        }
        @media (max-width: 760px) {
          .publish-layout { grid-template-columns: 1fr; }
          .form-grid { grid-template-columns: 1fr; }
          .field-row.full { grid-column: 1; }
        }
      `}</style>
    </section>
  );
}
