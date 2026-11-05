-- =============================================================================
-- Round 11 (plans): four tiers  free < standard < plus < pro.
-- member_plan was ('free','pro'). ADD VALUE can't be used in the same transaction
-- that adds it, so this file ONLY adds the values; 20261105001100 uses them.
-- Enum order = rank order (BEFORE 'pro'), so tier comparisons and ORDER BY work.
-- =============================================================================
alter type public.member_plan add value if not exists 'standard' before 'pro';
alter type public.member_plan add value if not exists 'plus' before 'pro';
