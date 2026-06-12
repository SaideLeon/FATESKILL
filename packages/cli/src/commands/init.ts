import fs from "fs-extra";

export async function initCommand(options: { name?: string; author?: string }) {
  const name = options.name ?? process.cwd().split(/[\\/]/).pop() ?? "my-skill";
  const manifest = {
    name,
    version: "0.1.0",
    description: "Descreva o que esta skill faz.",
    author: options.author ?? "anonymous",
    license: "MIT",
    visibility: "public",
    tags: [],
    ai: ["claude"],
    category: "uncategorized",
    entry: "SKILL.md"
  };

  await fs.writeJson("skill.json", manifest, { spaces: 2 });
  await fs.writeFile("SKILL.md", `# ${name}\n\n## Quando usar\nDescreva o gatilho da skill.\n\n## Instruções\nListe passos claros para a IA seguir.\n`);
  console.log("✓ skill.json e SKILL.md criados");
}
