export type SkillVisibility = "public" | "private" | "unlisted";

export type SkillSummary = {
  id?: string;
  name: string;
  slug: string;
  version: string;
  description: string;
  author: string;
  visibility: SkillVisibility;
  downloads: number;
  stars: number;
  tags: string[];
  category: string;
  ai_targets: string[];
  updated_at: string;
};

export type SkillVersion = {
  id?: string;
  version: string;
  changelog?: string | null;
  file_url: string;
  file_size?: number | null;
  is_latest: boolean;
  published_at: string;
};

export type SkillDetail = SkillSummary & {
  version_id?: string;
  entry_url: string;
  download_url: string;
  repository?: string | null;
  homepage?: string | null;
  versions: string[];
  instructions?: string;
};

export type SearchParams = {
  q?: string;
  tag?: string;
  category?: string;
  author?: string;
  sort?: "downloads" | "stars" | "recent";
  page?: number;
  limit?: number;
};
