-- Round 12 security (BUS LG7): account erasure also removes the personal data erase_user() left behind.
-- NOT APPLIED to staging: the founder applies it (after 20261105121000). Idempotent.
--
-- Fires once, when public.erase_user() (or an admin) sets profiles.deleted_at. Kept as a trigger so erase_user's body
-- (account_erase_hardening) stays untouched. The guardian consent ROW stays as evidence that consent existed
-- (DPPA s.8 accountability: who, when, version, scope, method) but the guardian's contact details are removed.
-- Stored FILES (tutor ID documents, store KYC files) must still be deleted from Storage by the backend deletion job:
-- this migration only removes the paths and personal fields. social_links (site-wide) and event_private (per event)
-- hold no member PII and are out of scope.
create or replace function app.erase_extra_pii()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.guardian_consents
     set guardian_name = 'Erased', guardian_email = 'erased@erased.invalid', guardian_phone = null,
         token_hash = null, requested_ip_hash = null
   where user_id = new.id;
  update public.tutor_applications
     set bio = '[erased] This tutor application was erased at the member''s request.',   -- CHECK: bio >= 50 chars
         expertise = '{erased}', credentials = '[]'::jsonb, linkedin_url = null, sample_url = null,   -- CHECK: expertise >= 1
         id_document_path = null, payout_phone_last4 = null
   where user_id = new.id;
  update public.mkt_store_private sp
     set legal_name = null, phone = null, kyc_documents = '{}'
    from public.mkt_stores s
   where s.id = sp.store_id and s.owner_id = new.id;
  return null;
end;
$$;
revoke execute on function app.erase_extra_pii() from public, anon, authenticated;

drop trigger if exists profiles_erase_extra_pii on public.profiles;
create trigger profiles_erase_extra_pii after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function app.erase_extra_pii();
