// Round 11 admin console: immutable root, scoped admins + invites, approval
// queue, plans as data, append-only audit, stats, read-only support view.
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;

async function draftCourse(db, owner = U.tutorA, slug = 'r11-admin-draft') {
  await as(db, 'postgres');
  return (await one(db, `insert into public.courses (slug, title, tutor_id, status) values ($1, 'R11 draft course', $2, 'draft') returning id`, [slug, owner])).id;
}
async function inviteAndAccept(db, user, email, scopes) {
  await as(db, U.root);
  const inv = (await one(db, `select public.admin_invite($1, $2::text[]) j`, [email, scopes])).j;
  await as(db, 'postgres');
  await q(db, `update public.profile_private set email=$2 where user_id=$1`, [user, email]);
  await as(db, 'service');
  await q(db, `select public.backend_accept_admin_invite($1, $2, $3)`, [user, email, inv.token]);
  return inv;
}

export const tests = [
  // ------------------------------------------------------------------ root ----
  t('root: only 101codecrafts@gmail.com binds, server-side only, to exactly one account', async (db) => {
    await as(db, 'postgres');
    assert.equal((await one(db, `select app.root_user_id() r`)).r, U.root);
    await as(db, U.alice);
    await fails(db, `select public.backend_bind_root($1, '101codecrafts@gmail.com')`, [U.alice], '42501');   // not callable by users
    await as(db, 'service');
    await fails(db, `select public.backend_bind_root($1, 'alice@example.com')`, [U.alice], /not the root email/);
    await fails(db, `select public.backend_bind_root($1, '101codecrafts@gmail.com')`, [U.alice], /already bound/);
    const again = (await one(db, `select public.backend_bind_root($1, ' 101CodeCrafts@gmail.com ') j`, [U.root])).j;   // idempotent, case-insensitive
    assert.equal(again.newly_bound, false);
    await as(db, U.root);
    const me = (await one(db, `select public.admin_me() j`)).j;
    assert.equal(me.role, 'root_admin'); assert.equal(me.is_root, true); assert.ok(me.scopes.includes('plans'));
    await as(db, U.alice);
    await fails(db, `update public.profile_private set email='101codecrafts@gmail.com' where user_id=$1`, [U.alice], /belongs to the root/);
  }),
  t('root: nobody can demote, remove, suspend or delete root (admins, service role, postgres)', async (db) => {
    await as(db, U.admin);
    await fails(db, `select public.admin_set_account_status($1,'suspended','nope')`, [U.root], '42501');
    await fails(db, `select public.admin_set_user_status($1,'banned','nope')`, [U.root], '42501');
    await fails(db, `select public.admin_set_role($1,'admin',false)`, [U.root], '42501');
    await fails(db, `select public.admin_remove_admin($1,'coup')`, [U.root], '42501');
    await as(db, U.root);
    await fails(db, `select public.admin_set_role($1,'super_admin',false)`, [U.root], /root admin cannot be removed/);
    await fails(db, `select public.admin_remove_admin($1,'self')`, [U.root], /root admin cannot be changed/);
    await fails(db, `select public.admin_set_role($1,'super_admin',true)`, [U.alice], /root admin cannot be removed|reserved/);
    for (const who of ['service', 'postgres']) {
      await as(db, who);
      await fails(db, `delete from public.user_roles where user_id=$1 and role='super_admin'`, [U.root], /root admin cannot be removed/);
      await fails(db, `delete from public.user_roles where user_id=$1 and role='admin'`, [U.root], /root admin cannot be removed/);
      await fails(db, `update public.profiles set account_status='banned' where id=$1`, [U.root], /cannot be suspended/);
      await fails(db, `update public.profiles set deleted_at=now() where id=$1`, [U.root], /cannot be suspended/);
      await fails(db, `delete from public.profiles where id=$1`, [U.root], /cannot be deleted/);
      await fails(db, `insert into public.user_roles (user_id, role) values ($1,'super_admin')`, [U.bob], /reserved for the root/);
      await fails(db, `delete from app.root_identity`, [], /immutable|permission denied/);
      await fails(db, `insert into public.admin_grants (user_id, scopes) values ($1, '{audit}')`, [U.root], /root has every scope/);
    }
    // break-glass: SQL editor only, explicit setting
    await as(db, 'postgres');
    await q(db, `set local app.break_glass = 'rebind-root'`);
    await q(db, `delete from app.root_identity`);
    assert.equal((await one(db, `select app.root_user_id() r`)).r, null);
  }),
  // -------------------------------------------------------------- admins -----
  t('admins: root invites by email, invitee accepts with the verified email, scopes are enforced', async (db) => {
    await as(db, U.admin);
    await fails(db, `select public.admin_invite('bob@example.com', '{approvals}')`, [], /root admin only/);
    await as(db, U.root);
    await fails(db, `select public.admin_invite('bob@example.com', '{everything}')`, [], /unknown scope/);
    await fails(db, `select public.admin_invite('101codecrafts@gmail.com', '{audit}')`, [], /root account/);
    const inv = (await one(db, `select public.admin_invite('Bob@Example.com', '{approvals,audit}') j`)).j;
    assert.match(inv.token, /^[0-9a-f]{64}$/);
    await as(db, 'postgres');
    assert.equal((await one(db, `select count(*)::int n from public.admin_invites where token_hash = $1`, [inv.token])).n, 0, 'raw token never stored');
    await as(db, 'service');
    await fails(db, `select public.backend_accept_admin_invite($1, 'alice@example.com', $2)`, [U.bob, inv.token], /invited email/);
    await fails(db, `select public.backend_accept_admin_invite($1, 'bob@example.com', 'nope')`, [U.bob], /not found/);
    await q(db, `select public.backend_accept_admin_invite($1, 'bob@example.com', $2)`, [U.bob, inv.token]);
    await fails(db, `select public.backend_accept_admin_invite($1, 'bob@example.com', $2)`, [U.bob, inv.token], /accepted/);
    await as(db, U.bob);
    const me = (await one(db, `select public.admin_me() j`)).j;
    assert.deepEqual(me.scopes, ['approvals', 'audit']); assert.equal(me.role, 'admin');
    await q(db, `select public.admin_review_queue()`);
    await q(db, `select public.admin_audit_search()`);
    await fails(db, `select public.admin_set_user_plan($1,'learner','pro','nope')`, [U.alice], /scope "users"/);
    await fails(db, `select public.admin_search_users()`, [], /scope "users"/);
    await fails(db, `select public.admin_set_flag('x.y', true)`, [], /scope "flags"/);
    await fails(db, `select public.admin_set_scopes($1, '{audit}')`, [U.admin], /root admin only/);
    await fails(db, `select public.admin_invite('carol@example.com', '{audit}')`, [], /root admin only/);
    await as(db, 'postgres');
    assert.ok(await one(db, `select 1 from public.audit_log where action='admin.invite_accept' and record_id=$1`, [U.bob]));
  }),
  t('admins: root sets scopes, suspends (no admin access at all), reinstates and removes; minors cannot be admins', async (db) => {
    await inviteAndAccept(db, U.bob, 'bob@example.com', ['users']);
    await as(db, U.root);
    await q(db, `select public.admin_set_scopes($1, '{users,plans}')`, [U.bob]);
    await fails(db, `select public.admin_set_admin_status($1, 'suspended', '')`, [U.bob], /reason/);
    await q(db, `select public.admin_set_admin_status($1, 'suspended', 'left the team')`, [U.bob]);
    await as(db, U.bob);
    assert.equal((await one(db, `select app.is_admin() a`)).a, false);
    await fails(db, `select public.admin_search_users()`, [], '42501');
    await as(db, U.root);
    await q(db, `select public.admin_set_admin_status($1, 'active', null)`, [U.bob]);
    await as(db, U.bob);
    assert.equal((await one(db, `select (public.admin_search_users()->>'total')::int >= 1 ok`)).ok, true);
    await fails(db, `select public.admin_set_admin_status($1, 'suspended', 'self')`, [U.bob], /root admin only/);
    await as(db, U.root);
    await q(db, `select public.admin_remove_admin($1, 'done')`, [U.bob]);
    await as(db, U.bob);
    assert.equal((await one(db, `select app.is_admin() a`)).a, false);
    const list = await (async () => { await as(db, U.root); return (await one(db, `select public.admin_list_admins() j`)).j; })();
    assert.ok(list.admins.some((a) => a.user_id === U.root && a.is_root));
    assert.ok(!list.admins.some((a) => a.user_id === U.bob));
    // minor
    await as(db, U.root);
    const inv = (await one(db, `select public.admin_invite('kid@example.com', '{audit}') j`)).j;
    await as(db, 'service');
    await fails(db, `select public.backend_accept_admin_invite($1, 'kid@example.com', $2)`, [U.kid, inv.token], /adults/);
  }),
  // ------------------------------------------------------------ approvals ----
  t('approvals: tutors submit, nothing is public until approved, reasons + notifications + before→after audit', async (db) => {
    const cid = await draftCourse(db);
    await as(db, U.alice);
    await fails(db, `select public.submit_for_review('course', $1, 'Mine now')`, [cid], '42501');
    await fails(db, `insert into public.review_submissions (kind, entity_ref, submitter_id, title) values ('link','x',$1,'x')`, [U.alice], '42501');
    await as(db, U.tutorA);
    const s = await one(db, `select * from public.submit_for_review('course', $1, 'R11 draft course', 'Intro', '{"modules":2}'::jsonb, '{https://www.youtube.com/watch?v=dQw4w9WgXcQ}')`, [cid]);
    assert.equal(s.status, 'pending');
    assert.equal((await one(db, `select status from public.courses where id=$1`, [cid])).status, 'pending_review');
    await as(db, 'anon');
    assert.equal((await q(db, `select 1 from public.courses where id=$1`, [cid])).length, 0, 'not visible to the public');
    await fails(db, `select public.is_approved('course', $1)`, [cid], '42501');   // SR-04 allow-list: not an anon RPC
    await as(db, U.bob);
    assert.equal((await one(db, `select public.is_approved('course', $1) a`, [cid])).a, false);
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.review_submissions`)).length, 0, 'other members cannot read the queue');
    await as(db, U.tutorA);   // resubmit bumps the version
    const s2 = await one(db, `select * from public.submit_for_review('course', $1, 'R11 draft course v2', null, '{}'::jsonb, '{https://www.youtube.com/watch?v=dQw4w9WgXcQ}')`, [cid]);
    assert.equal(s2.id, s.id); assert.equal(s2.version, 2);
    await as(db, U.admin);
    const queue = (await one(db, `select public.admin_review_queue() j`)).j;
    assert.ok(queue.items.some((i) => i.id === s.id && i.submitter.display_name === 'Tutor Amina'));
    await fails(db, `select public.admin_decide_submission($1, 'approve')`, [s.id], /override note/);     // links not scanned yet
    await fails(db, `select public.admin_decide_submission($1, 'reject', 'no')`, [s.id], /reason/);
    await as(db, 'service');
    await q(db, `select public.backend_set_submission_risk($1, 'low', '[{"code":"youtube_ok"}]'::jsonb)`, [s.id]);
    await as(db, U.admin);
    await q(db, `select public.admin_decide_submission($1, 'approve')`, [s.id]);
    await as(db, U.bob);
    assert.equal((await one(db, `select public.is_approved('course', $1) a`, [cid])).a, true);
    assert.equal((await one(db, `select status from public.courses where id=$1`, [cid])).status, 'published');
    await as(db, 'postgres');
    assert.ok(await one(db, `select 1 from public.notifications where user_id=$1 and type='review.approve'`, [U.tutorA]));
    const a = await one(db, `select old_data, new_data, actor_role from public.audit_log where action='admin.review_approve' and record_id=$1`, [s.id]);
    assert.equal(a.old_data.status, 'pending'); assert.equal(a.new_data.status, 'approved'); assert.equal(a.actor_role, 'admin');
    await as(db, U.admin);
    await fails(db, `select public.admin_decide_submission($1, 'reject', 'too late')`, [s.id], /approved/);
  }),
  t('approvals: request changes, blocked links, resubmission, self-review', async (db) => {
    await as(db, U.tutorA);
    const link = await one(db, `select * from public.submit_for_review('link', 'link-1', 'Cool tool', null, '{}'::jsonb, '{http://bit.ly/abc}')`);
    await as(db, 'service');
    await q(db, `select public.backend_set_submission_risk($1, 'blocked', '[{"code":"web_risk","detail":"MALWARE"}]'::jsonb)`, [link.id]);
    await as(db, U.admin);
    await fails(db, `select public.admin_decide_submission($1, 'approve', 'looks fine to me')`, [link.id], /blocked/);
    await q(db, `select public.admin_decide_submission($1, 'request_changes', 'Replace the short link with the real https URL', '["use https","no shorteners"]'::jsonb)`, [link.id]);
    await as(db, U.tutorA);
    const again = await one(db, `select * from public.submit_for_review('link', 'link-1', 'Cool tool', null, '{}'::jsonb, '{https://example.org/tool}')`);
    assert.equal(again.status, 'pending'); assert.equal(again.risk_level, 'unchecked');
    // self review
    await inviteAndAccept(db, U.tutorB, 'brian@example.com', ['approvals']);
    await as(db, U.tutorB);
    const own = await one(db, `select * from public.submit_for_review('video', 'vid-1', 'My video', null, '{}'::jsonb, '{}')`);
    await fails(db, `select public.admin_decide_submission($1, 'approve')`, [own.id], /your own submission/);
  }),
  // ---------------------------------------------------------------- plans ----
  t('plans: admin per-user override is scoped, needs a reason, audited before→after, notifies; users cannot self-upgrade', async (db) => {
    await as(db, U.alice);
    await fails(db, `select public.admin_set_user_plan($1,'learner','pro','gift')`, [U.alice], '42501');
    await fails(db, `update public.profiles set plan='pro' where id=$1`, [U.alice], '42501');
    await as(db, U.admin);
    await fails(db, `select public.admin_set_user_plan($1,'learner','pro','')`, [U.alice], /reason/);
    await fails(db, `select public.admin_set_user_plan($1,'learner','gold','x y z')`, [U.alice], /bad audience or plan/);
    const r = (await one(db, `select public.admin_set_user_plan($1,'learner','pro','scholarship') j`, [U.alice])).j;
    assert.equal(r.plan, 'pro');
    // standard/plus/tutor plans exist once the r11 plans migration is merged; before that a clear error
    await q(db, `savepoint p`);
    try { await q(db, `select public.admin_set_user_plan($1,'tutor','standard','pilot tutor')`, [U.tutorA]); }
    catch (e) { assert.match(e.message, /needs the r11 plans migration/); await q(db, `rollback to savepoint p`); }
    await as(db, 'postgres');
    const a = await one(db, `select old_data, new_data from public.audit_log where action='admin.set_user_plan' and record_id=$1 order by id limit 1`, [U.alice]);
    assert.equal(a.old_data.plan, 'free'); assert.equal(a.new_data.plan, 'pro');
    assert.ok(await one(db, `select 1 from public.notifications where user_id=$1 and type='account.plan'`, [U.alice]));
    await as(db, U.admin);
    assert.equal((await one(db, `select public.admin_search_users('alice')->'items'->0->>'learner_plan' p`)).p, 'pro');
  }),
  // ---------------------------------------------------------- audit + stats --
  t('audit: append-only for everyone; flags write before→after; stats are real numbers with zeros when empty', async (db) => {
    await as(db, U.admin);
    await q(db, `select public.admin_set_flag('r11.demo', true, 50)`);
    await q(db, `select public.admin_set_flag('r11.demo', false, 50)`);
    await as(db, 'postgres');
    const a = await one(db, `select old_data, new_data from public.audit_log where action='admin.set_flag' and record_id='r11.demo' order by id desc limit 1`);
    assert.equal(a.old_data.enabled, true); assert.equal(a.new_data.enabled, false);
    for (const who of ['postgres', 'service']) {
      await as(db, who);
      await fails(db, `update public.audit_log set action='x' where id=(select max(id) from public.audit_log)`, [], who === 'postgres' ? /append-only/ : undefined);
      await fails(db, `delete from public.audit_log`, [], who === 'postgres' ? /append-only/ : undefined);
    }
    await as(db, U.admin);
    const st = (await one(db, `select public.admin_console_stats() j`)).j;
    assert.equal(st.submissions_pending, 0); assert.equal(st.support_views_7d, 0);
    assert.equal(typeof st.members_total, 'number'); assert.ok(st.admins >= 2);
    assert.deepEqual(st.submissions_by_kind, {});
    await as(db, U.alice);
    await fails(db, `select public.admin_console_stats()`, [], '42501');
    const page = (await (async () => { await as(db, U.admin); return one(db, `select public.admin_audit_search(null,'admin.set_flag') j`); })()).j;
    assert.ok(page.total >= 2 && page.items[0].actor_name === 'Plain Admin');
  }),
  // --------------------------------------------------------- support view ----
  t('support view: read-only snapshot, reason required, user notified, every read audited, root/admins protected', async (db) => {
    await as(db, U.alice);
    await fails(db, `select public.admin_start_support_view($1, 'curious')`, [U.bob], '42501');
    await as(db, U.admin);
    await fails(db, `select public.admin_start_support_view($1, 'hi')`, [U.alice], /5\+ characters/);
    await fails(db, `select public.admin_start_support_view($1, 'checking root')`, [U.root], /cannot be viewed/);
    await inviteAndAccept(db, U.tutorB, 'brian@example.com', ['audit']);
    await as(db, U.admin);
    await fails(db, `select public.admin_start_support_view($1, 'checking admin')`, [U.tutorB], /only root/);
    const s = await one(db, `select * from public.admin_start_support_view($1, 'Ticket 42: progress missing', 'T-42')`, [U.alice]);
    const snap = (await one(db, `select public.admin_support_snapshot($1) j`, [s.id])).j;
    assert.equal(snap.session.read_only, true); assert.equal(snap.profile.id, U.alice); assert.equal(snap.role, 'learner');
    assert.match(snap.profile.email_masked, /^a•••@example\.com$/);
    await as(db, U.tutorB);   // another admin can't read someone else's session
    await fails(db, `select public.admin_support_snapshot($1)`, [s.id], /scope|not found/);
    await as(db, 'postgres');
    assert.ok(await one(db, `select 1 from public.notifications where user_id=$1 and type='account.support_view'`, [U.alice]));
    assert.equal((await one(db, `select count(*)::int n from public.audit_log where action like 'admin.support_view%' and actor_id=$1`, [U.admin])).n, 2);
    await q(db, `update public.support_view_sessions set expires_at = now() - interval '1 minute' where id=$1`, [s.id]);
    await as(db, U.admin);
    await fails(db, `select public.admin_support_snapshot($1)`, [s.id], /ended/);
    await as(db, U.alice);
    assert.equal((await q(db, `select 1 from public.support_view_sessions where target_id=$1`, [U.alice])).length, 1, 'the user can see who viewed them');
  }),
  t('users: search with roles/plans/minor flags; role + status changes are scoped and audited', async (db) => {
    await as(db, U.admin);
    const r = (await one(db, `select public.admin_search_users('kid') j`)).j;
    const kid = r.items.find((x) => x.id === U.kid);
    assert.equal(kid.is_minor, true); assert.equal(kid.guardian.state, 'verified'); assert.equal(kid.learner_plan, 'free');
    const roots = (await one(db, `select public.admin_search_users(null, 'root_admin') j`)).j;
    assert.equal(roots.total, 1); assert.equal(roots.items[0].role, 'root_admin');
    await fails(db, `select public.admin_set_user_role($1,'tutor',true)`, [U.kid], /adults/);
    await fails(db, `select public.admin_set_user_role($1,'admin',true)`, [U.bob], /admins are invited/);
    await q(db, `select public.admin_set_user_role($1,'tutor',true,'runs a club')`, [U.bob]);
    await q(db, `select public.admin_set_user_status($1,'suspended','spam', null)`, [U.bob]);
    await as(db, 'postgres');
    assert.equal((await one(db, `select account_status from public.profiles where id=$1`, [U.bob])).account_status, 'suspended');
    assert.ok(await one(db, `select 1 from public.audit_log where action='admin.set_user_status' and record_id=$1 and old_data->>'account_status'='active'`, [U.bob]));
    await as(db, U.admin);
    const g = (await one(db, `select (public.admin_search_users('kid')->'items'->0->'guardian'->>'id') id`)).id;
    await q(db, `select public.admin_revoke_guardian($1, 'guardian asked')`, [g]);
  }),
];
