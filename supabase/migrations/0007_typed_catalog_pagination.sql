-- ============================================================================
-- Migration: 0007_typed_catalog_pagination.sql
-- Purpose:   Typed, SQL-Level Stable Cursor Pagination for Catalog Programs.
-- Security:
--   * Locks search_path to public to prevent search path hijacking.
--   * Replaces PostgREST raw string filter interpolation with fully parameterized
--     typed SQL evaluation, immune to filter injection, escaping, or delimiter issues.
--   * Safe for public catalog viewers (anon, authenticated, service_role).
-- ============================================================================

create or replace function public.get_paginated_programs(
  p_limit integer default 20,
  p_cursor_title text default null,
  p_cursor_id uuid default null,
  p_ascending boolean default true,
  p_genre text default null,
  p_query text default null
)
returns table (
  id uuid,
  slug text,
  title text,
  genre text,
  synopsis text,
  release_year integer,
  rating text,
  poster_url text,
  backdrop_url text,
  license_info text,
  is_active boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_genre text := nullif(btrim(p_genre), '');
  v_query text := nullif(btrim(p_query), '');
begin
  return query
  select
    p.id,
    p.slug,
    p.title,
    p.genre,
    p.synopsis,
    p.release_year,
    p.rating,
    p.poster_url,
    p.backdrop_url,
    p.license_info,
    p.is_active
  from public.programs p
  where p.is_active = true
    and (v_genre is null or p.genre ilike ('%' || v_genre || '%'))
    and (
      v_query is null
      or (p.title ilike ('%' || v_query || '%') or p.synopsis ilike ('%' || v_query || '%'))
    )
    and (
      p_cursor_title is null
      or (
        case
          when p_ascending then
            (p.title > p_cursor_title) or (p.title = p_cursor_title and p.id > p_cursor_id)
          else
            (p.title < p_cursor_title) or (p.title = p_cursor_title and p.id < p_cursor_id)
        end
      )
    )
  order by
    case when p_ascending then p.title end asc,
    case when not p_ascending then p.title end desc,
    case when p_ascending then p.id end asc,
    case when not p_ascending then p.id end desc
  limit v_limit;
end;
$$;

comment on function public.get_paginated_programs(integer, text, uuid, boolean, text, text) is
  'Returns actively published catalog programs using typed cursor evaluation, preventing raw PostgREST string filter interpolation.';

-- ----------------------------------------------------------------------------
-- Scoped Grants: Catalog is public browsing metadata
-- ----------------------------------------------------------------------------
revoke all on function public.get_paginated_programs(integer, text, uuid, boolean, text, text) from public;
grant execute on function public.get_paginated_programs(integer, text, uuid, boolean, text, text) to anon, authenticated, service_role;
