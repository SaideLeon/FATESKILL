import { apiClient } from "../api-client.js";

export async function infoCommand(name: string) {
  const client = await apiClient();
  const { data } = await client.get(`/skills/${name}`);
  console.log(`${data.name}@${data.version}`);
  console.log(data.description);
  console.log(`author: ${data.author}`);
  console.log(`downloads: ${data.downloads} · stars: ${data.stars}`);
  console.log(`download: ${data.download_url}`);
}
