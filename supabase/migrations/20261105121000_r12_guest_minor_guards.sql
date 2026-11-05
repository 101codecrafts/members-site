-- Round 12 security: guest and unconsented-minor rules that also hold inside SECURITY DEFINER functions.
-- NOT APPLIED to staging: the founder applies it (after 20261105120000_r12_security.sql). Idempotent.
--
-- Why triggers and not more RESTRICTIVE policies: definer functions are owned by postgres, which bypasses RLS, so
-- r11_no_guest_write / r11_minor_consent policies do not stop event_rsvp, create_checkout, mkt_checkout, join flows
-- (logic L5). BEFORE INSERT triggers fire in every context and read the CALLER from the JWT
-- (app.requesting_user_id()), so the service role (no JWT sub) is never blocked.
--
-- BUS S3 / L7 (guest writes), L6 (guest event registration + paid event checkout), L5 (minor without consent buying
-- through definer checkouts). Access policy (src/data/access-policy.json): guests buy on the marketplace only and
-- may not create community content, register for events or enter competitions; unconsented minors may not buy.

create or replace function app.guard_no_guest_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_guest_only() then
    raise exception 'guests cannot do this: become a learner or tutor first' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['study_groups','opportunities','jobs','competition_entrants','competition_teams','competition_submissions',
                           'external_events','ai_tools','launch_placements','test_testers','test_feedback','event_registrations'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists r12_no_guest_insert on public.%I', t);
      execute format('create trigger r12_no_guest_insert before insert on public.%I for each row execute function app.guard_no_guest_insert()', t);
    end if;
  end loop;
end $$;

-- payments: same guest rule as 20261105001100 plus event tickets (L6); and an unconsented minor cannot open ANY
-- checkout as the buyer (L5). The minor rule applies only when the caller is the buyer, so server-side inserts
-- (e.g. a subscription renewal Flutterwave already charged) are never dropped.
create or replace function app.guard_payment_buyer()     -- stays SECURITY DEFINER, as in 20261105001100
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and new.purpose in ('course','tutor_session','subscription','event_ticket') and not app.r11_has_member_role(new.user_id) then
    raise exception 'guests can only buy on the marketplace: become a learner or tutor first' using errcode = '42501';
  end if;
  if new.user_id is not null and new.user_id = app.requesting_user_id()
     and exists (select 1 from public.profiles p where p.id = new.user_id and p.is_minor)
     and not app.has_guardian_consent(new.user_id) then
    raise exception 'a parent or guardian must give consent before an under-18 account can buy' using errcode = '42501';
  end if;
  return new;
end;
$$;
