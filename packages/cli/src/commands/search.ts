import { apiClient } from "../api-client.js";

export async function searchCommand(query: string, options: { tag?: string; category?: string; sort?: string }) {
  const client = await apiClient();
  const { data } = await client.get("/skills", { params: { q: query, ...options } });
  const skills = data.data ?? [];
  for (const skill of skills) {
    console.log(`${skill.name}@${skill.version} — ${skill.description}`);
    console.log(`  ${skill.downloads} downloads · ${skill.stars} stars · ${skill.tags.join(", ")}`);
  }
}
