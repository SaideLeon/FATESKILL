create or replace function increment_skill_stars(p_skill_id uuid) returns void
language sql as $$
  update skills set stars = stars + 1 where id = p_skill_id;
$$;

create or replace function decrement_skill_stars(p_skill_id uuid) returns void
language sql as $$
  update skills set stars = greatest(stars - 1, 0) where id = p_skill_id;
$$;

create or replace function increment_skill_downloads(p_skill_id uuid) returns void
language sql as $$
  update skills set downloads = downloads + 1 where id = p_skill_id;
$$;
