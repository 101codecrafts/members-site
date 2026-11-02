// Meetings, announcements targeting, opportunities, tech events, email guard.
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;

export const tests = [
  t('meetings: OAuth tokens + links never client-readable; only paid bookers join in window; minors need consent + verified tutor', async (db) => {
    await as(db, 'postgres');
    const s = await one(db, `insert into public.tutor_sessions (tutor_id, kind, title, starts_at, capacity, price_ugx) values ($1,'group','Live class', now() + interval '5 minutes', 10, 0) returning id`, [U.tutorA]);
    await as(db, U.tutorA);
    const m = await one(db, `select * from public.meeting_create('tutor_session', $1, 'jitsi', 'Live class', now() + interval '5 minutes', 60)`, [s.id]);
    await as(db, U.tutorB);
    await fails(db, `select public.meeting_create('tutor_session', $1, 'jitsi', 'Hijack', now(), 60)`, [s.id], '42501');
    await as(db, 'service');
    await q(db, `select public.meeting_set_link($1, 'https://meet.jit.si/101cc-abc123xyz')`, [m.id]);
    await q(db, `insert into public.meeting_oauth_tokens (user_id, provider, access_enc) values ($1,'zoom','v1:enc')`, [U.tutorA]);
    for (const who of [U.tutorA, U.alice]) {
      await as(db, who);
      await fails(db, `select * from public.meeting_oauth_tokens`, [], '42501');
      await fails(db, `select * from public.meeting_private`, [], '42501');
    }
    await as(db, U.alice);
    await fails(db, `select public.meeting_join($1)`, [m.id], /not allowed/);
    await as(db, 'postgres');
    await q(db, `insert into public.session_bookings (session_id, learner_id, status) values ($1,$2,'confirmed'), ($1,$3,'confirmed')`, [s.id, U.alice, U.kid]);
    await as(db, U.alice);
    const j = (await one(db, `select public.meeting_join($1) j`, [m.id])).j;
    assert.equal(j.join_url, 'https://meet.jit.si/101cc-abc123xyz');
    await as(db, U.kid);   // kid has verified guardian consent; tutorA is verified → allowed
    assert.ok((await one(db, `select public.meeting_join($1) j`, [m.id])).j.join_url);
    await as(db, 'postgres');
    await q(db, `update public.guardian_consents set revoked_at = now() where user_id=$1`, [U.kid]);
    await as(db, U.kid);
    await fails(db, `select public.meeting_join($1)`, [m.id], /not allowed/);
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.meeting_attendance`)).length, 0);
    await as(db, U.tutorA);
    assert.equal((await q(db, `select 1 from public.meeting_attendance where meeting_id=$1`, [m.id])).length, 2, 'host sees attendance');
    await as(db, 'service');
    assert.equal((await q(db, `select * from public.meetings_claim_reminders('15m')`)).length, 1);
    assert.equal((await q(db, `select * from public.meetings_claim_reminders('15m')`)).length, 0, 'claimed once');
  }),

  t('announcements: drafts admin-only; scheduled hidden until due; level targeting; read receipts own-only', async (db) => {
    await as(db, U.admin);
    await q(db, `insert into public.announcements (title, body, audience) values ('Draft one','x','members')`);
    await q(db, `insert into public.announcements (title, body, audience, published_at) values ('Future one','x','members', now() + interval '1 day')`);
    const a = await one(db, `insert into public.announcements (title, body, audience, published_at, target_levels) values ('Uni only','x','members', now() - interval '1 minute', '{university}') returning id`);
    await as(db, U.alice);   // university
    assert.deepEqual((await q(db, `select title from public.announcements where title in ('Draft one','Future one','Uni only')`)).map((r) => r.title), ['Uni only']);
    await q(db, `insert into public.announcement_reads (announcement_id, user_id) values ($1,$2)`, [a.id, U.alice]);
    await fails(db, `insert into public.announcement_reads (announcement_id, user_id) values ($1,$2)`, [a.id, U.bob]);
    await as(db, U.kid);     // primary
    assert.equal((await q(db, `select 1 from public.announcements where id=$1`, [a.id])).length, 0);
    await as(db, 'anon');
    assert.equal((await q(db, `select 1 from public.announcements where id=$1`, [a.id])).length, 0);
  }),

  t('opportunities: member submissions moderated; minors see age-appropriate types only; expiry; saves private', async (db) => {
    await as(db, U.alice);
    const o = await one(db, `insert into public.opportunities (type, title, org, url, canonical_url, status, verified_by_admin) values ('job','Junior dev role','Acme','https://acme.ug/j','acme.ug/j','published',true) returning id, status, verified_by_admin`);
    assert.equal(o.status, 'pending_review'); assert.equal(o.verified_by_admin, false);
    await as(db, U.admin);
    await q(db, `update public.opportunities set status='published', deadline_at=now()+interval '3 days' where id=$1`, [o.id]);
    await q(db, `insert into public.opportunities (type, title, org, url, canonical_url, status, deadline_at) values ('scholarship','STEM scholarship','Gov','https://gov.ug/s','gov.ug/s','published', now()+interval '3 days'),
      ('hackathon','Past hack','XHub','https://x.ug/h','x.ug/h','published', now()-interval '1 day')`);
    await as(db, U.kid);
    assert.deepEqual((await q(db, `select type from public.opportunities order by type`)).map((r) => r.type), ['scholarship']);
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.opportunities`)).length, 2, 'adult sees job + scholarship, not expired');
    await q(db, `insert into public.opportunity_saves (user_id, opportunity_id) values ($1,$2)`, [U.bob, o.id]);
    await as(db, U.alice);
    assert.equal((await q(db, `select 1 from public.opportunity_saves`)).length, 0);
    await as(db, 'service');
    assert.equal((await one(db, `select public.expire_opportunities() n`)).n, 1);
  }),

  t('events: RSVP capacity + waitlist promotion; minors need guardian for physical; organiser-only check-in; external events moderated', async (db) => {
    await as(db, 'postgres');
    const e = await one(db, `insert into public.events (slug, title, starts_at, capacity, status, created_by, mode) values ('gdg-kla-meetup','GDG Kampala meetup', now()+interval '2 days', 1, 'published', $1, 'physical') returning id`, [U.tutorA]);
    await as(db, U.alice);
    assert.equal((await one(db, `select status from public.event_rsvp($1)`, [e.id])).status, 'registered');
    await as(db, U.bob);
    assert.equal((await one(db, `select status from public.event_rsvp($1)`, [e.id])).status, 'waitlisted');
    await as(db, U.alice);
    await q(db, `select public.event_cancel_rsvp($1)`, [e.id]);
    await as(db, 'postgres');
    assert.equal((await one(db, `select status from public.event_registrations where event_id=$1 and user_id=$2`, [e.id, U.bob])).status, 'registered', 'promoted');
    await q(db, `update public.guardian_consents set revoked_at = now() where user_id=$1`, [U.kid]);
    await as(db, U.kid);
    await fails(db, `select public.event_rsvp($1)`, [e.id], /guardian consent/);
    await as(db, U.bob);
    await fails(db, `select public.event_check_in($1,$2)`, [e.id, U.bob], '42501');
    await as(db, U.tutorA);
    assert.equal((await one(db, `select status from public.event_check_in($1,$2)`, [e.id, U.bob])).status, 'attended');
    await as(db, U.alice);
    const x = await one(db, `insert into public.external_events (title, starts_at, source_url, dedupe_key, status, verified) values ('AI meetup', now()+interval '3 days','https://lu.ma/x','luma:x','published',true) returning status, verified`);
    assert.equal(x.status, 'pending_review'); assert.equal(x.verified, false);
    await as(db, 'anon');
    assert.equal((await q(db, `select 1 from public.external_events`)).length, 0);
  }),

  t('email guard: domain rules admin-managed; allow beats deny for subdomains; security events + fingerprints service-only', async (db) => {
    await as(db, U.alice);
    await fails(db, `insert into public.email_domain_rules (domain, rule) values ('evil.com','allow')`, []);
    await as(db, U.admin);
    await q(db, `insert into public.email_domain_rules (domain, rule) values ('cavendish.ac.ug','deny')`);
    await as(db, 'service');
    assert.equal((await one(db, `select public.email_domain_rule('students.cavendish.ac.ug') r`)).r, 'allow');
    assert.equal((await one(db, `select public.email_domain_rule('staff.cavendish.ac.ug') r`)).r, 'deny');
    await q(db, `select public.log_security_event('signup.blocked_disposable', null, 'mailinator.com')`);
    await as(db, U.alice);
    await fails(db, `select public.log_security_event('x.y.z')`, [], '42501');
    assert.equal((await q(db, `select 1 from public.security_events`)).length, 0);
    await fails(db, `select * from public.email_fingerprints`, [], '42501');
    await as(db, U.admin);
    assert.equal((await q(db, `select 1 from public.security_events`)).length, 1);
  }),
];
