-- SR-04 follow-up: per-schema `alter default privileges ... revoke` cannot remove
-- the GLOBAL default (EXECUTE to PUBLIC on every new function), so a function
-- created after this point would still be executable by anon. Revoke globally
-- for the roles that own migrations. Every user-callable RPC must now be
-- granted explicitly (grant execute ... to authenticated/anon).
alter default privileges revoke execute on functions from public;
alter default privileges for role postgres revoke execute on functions from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    begin
      execute 'alter default privileges for role supabase_admin revoke execute on functions from public';
    exception when insufficient_privilege then null; end;
  end if;
end $$;

select app.enable_rls_all();
