-- Round 12 money: L4. The tutor plan's students.max (Free = 2) also caps PAID course enrolments.
-- NOT APPLIED to staging: the founder applies it, after 20261106010000_r12_money_l1_l2.sql. Idempotent.
--
-- Before: create_checkout('course') never called can_enroll, and app.guard_enrollment_plan skips rows with a payment_id
-- (paid enrolments come from the verified webhook), so a Free tutor could get 3+ paying students.
-- Now a BEFORE INSERT trigger on payments refuses a course checkout when the tutor is full. It is the place to refuse:
-- before the learner pays, never after money was taken. Seats are counted as app.tutor_student_count (active/completed
-- enrolments + live session bookings) PLUS other learners' course checkouts for this tutor that are still pending and
-- under an hour old (reserved seats), under a per-tutor advisory lock, so parallel checkouts cannot overshoot the cap.
-- A learner who is already the tutor's student, the tutor buying their own course, admins, and calls without a JWT
-- (service / maintenance) are not limited. Fulfilment is unchanged: a payment that was allowed at checkout is honoured.

create or replace function app.guard_course_checkout_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tutor text; tcap bigint; used bigint; reserved bigint;
begin
  if new.purpose <> 'course' or new.user_id is null then return new; end if;
  if app.requesting_user_id() is null or app.is_admin() then return new; end if;
  select c.tutor_id into tutor from public.courses c where c.id = new.reference_id;
  if tutor is null or tutor = new.user_id or app.is_student_of(tutor, new.user_id) then return new; end if;
  tcap := app.plan_limit('tutor', app.user_plan(tutor, 'tutor'), 'students.max');
  if tcap is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('tutor-seats:' || tutor));
  used := app.tutor_student_count(tutor);
  select count(distinct p.user_id) into reserved
    from public.payments p join public.courses c on c.id = p.reference_id
   where p.purpose = 'course' and c.tutor_id = tutor and p.status = 'pending' and p.created_at > now() - interval '1 hour'
     and p.user_id <> new.user_id and p.user_id <> tutor and not app.is_student_of(tutor, p.user_id);
  if used + reserved >= tcap then
    raise exception 'this tutor is not taking new students on their current plan (limit %)', tcap
      using errcode = 'P0001', detail = jsonb_build_object('reason', 'tutor_full', 'limit', tcap, 'used', used, 'reserved', reserved)::text;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_course_capacity_guard on public.payments;
create trigger payments_course_capacity_guard before insert on public.payments
  for each row execute function app.guard_course_checkout_capacity();

revoke execute on function app.guard_course_checkout_capacity() from public, anon, authenticated;
