-- =============================================================================
-- Activity feed reactions + comments (dashboard "Recent activity").
-- An activity is a community post (public.posts); likes are public.reactions
-- rows with emoji = 'like', comments are public.post_comments. The tables, the
-- counters and the insert policies already exist (20261102000600_community,
-- 20261102000990_rls_policies_grants). This migration only fills the gaps the
-- activity feed needs:
--   * authors may delete their own comments (was admin-only)
--   * any authenticated user may read likes and comments of visible posts
--     (reactions were member-only)
--   * a partial index for counting likes per post
-- Idempotent: safe to re-run. NOT yet applied to any database.
-- =============================================================================

alter table public.reactions     enable row level security;
alter table public.post_comments enable row level security;

-- users delete only their own comments (admins keep post_comments_delete)
drop policy if exists post_comments_delete_own on public.post_comments;
create policy post_comments_delete_own on public.post_comments for delete to authenticated
  using (author_id = (select app.requesting_user_id()));

-- reads for authenticated users (permissive policies OR with the existing ones)
drop policy if exists reactions_select_authenticated on public.reactions;
create policy reactions_select_authenticated on public.reactions for select to authenticated
  using (post_id is null or exists (select 1 from public.posts p where p.id = post_id));

-- inserts stay as reactions_insert / post_comments_insert (own rows, members only);
-- deletes of reactions stay reactions_delete (own rows only).

grant select, insert, delete on public.reactions     to authenticated;
grant select, insert, delete on public.post_comments to authenticated;

create index if not exists reactions_post_like_idx on public.reactions (post_id) where emoji = 'like';
