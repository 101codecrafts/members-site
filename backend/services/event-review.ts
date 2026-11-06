import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Session } from '@/lib/auth';
import type { Db } from '@/lib/supabase/user';
import { serviceClient } from '@/lib/supabase/admin';
import { AppError, notFound } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { rpc } from '@/repositories/rpc';
import { requireScope } from '@/services/admin-console';
import { BASE_COLS, EXT_COLS, decisionNotice, isSchemaOutdated, toPendingItem, type Decision, type PendingRow, type Person } from '@/lib/event-review';

/**
 * Round 12: the admin "Events to review" queue. Scope 'approvals' (root has every scope; legacy admins keep it).
 * types/database.ts mirrors staging, which does not have migration 20261106030000 yet, so the new columns, table and
 * RPC are reached through an untyped view of the same client. Every call still runs as the admin (RLS + the RPC's own
 * scope check); only the degraded audit row and notification use the service role, after the admin's own update worked.
 */
const log = createLogger({ mod: 'event-review' });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = (db: Db) => db as unknown as SupabaseClient<any, 'public', any>;

export async function pendingEvents(s: Session, p: { limit: number; offset: number }) {
  await requireScope(s, 'approvals');
  const db = raw(s.db);
  const page = (cols: string) => db.from('external_events').select(cols, { count: 'exact' }).eq('status', 'pending_review')
    .order('created_at', { ascending: true }).range(p.offset, p.offset + p.limit - 1);
  let extended = true;
  let r = await page(`${BASE_COLS}, ${EXT_COLS}`);
  if (r.error && isSchemaOutdated(r.error)) { extended = false; log.warn('event_review_queue_degraded', { code: r.error.code }); r = await page(BASE_COLS); }
  if (r.error) throw r.error;
  const rows = (r.data ?? []) as unknown as PendingRow[];
  const ids = [...new Set(rows.map((x) => x.submitted_by).filter((x): x is string => !!x))];
  const people = ids.length ? (((await db.from('profiles').select('id, display_name, username').in('id', ids)).data ?? []) as Person[]) : [];
  const contacts: Record<string, string> = {};
  if (extended && rows.length) {
    const c = await db.from('external_event_contacts').select('event_id, contact_email').in('event_id', rows.map((x) => x.id));
    if (!c.error) for (const x of (c.data ?? []) as { event_id: string; contact_email: string }[]) contacts[x.event_id] = x.contact_email;
    else if (!isSchemaOutdated(c.error)) log.warn('event_review_contacts_failed', { code: c.error.code });
  }
  return { total: r.count ?? rows.length, limit: p.limit, offset: p.offset, details_available: extended,
           items: rows.map((x) => toPendingItem(x, people, contacts, extended)) };
}

export async function reviewEvent(s: Session, id: string, decision: Decision, reason: string | null) {
  await requireScope(s, 'approvals');
  const db = raw(s.db);
  const done = await db.rpc('admin_review_external_event', { p_id: id, p_decision: decision, p_reason: reason });
  if (!done.error) return done.data as { id: string; status: string; reason: string | null; reviewed_at: string };
  const err = done.error as { code?: string; message?: string };
  if (err.code === 'P0001' && /already reviewed/.test(err.message ?? '')) throw new AppError('conflict', err.message ?? 'This event was already reviewed');
  if (!isSchemaOutdated(err)) throw err;
  log.warn('event_review_degraded', { code: err.code });
  // Degraded path (migration 20261106030000 not applied): status only; the reason lives in the audit row and the notice.
  const cur = await db.from('external_events').select('id, title, status, submitted_by').eq('id', id).maybeSingle();
  if (cur.error) throw cur.error;
  const ev = cur.data as { id: string; title: string; status: string; submitted_by: string | null } | null;
  if (!ev) throw notFound('Event not found');
  if (ev.status !== 'pending_review') throw new AppError('conflict', `This event was already reviewed (status ${ev.status})`);
  const next = decision === 'approve' ? 'published' : 'rejected';
  const u = await db.from('external_events').update({ status: next }).eq('id', id).eq('status', 'pending_review').select('id').maybeSingle();
  if (u.error) throw u.error;
  if (!u.data) throw new AppError('conflict', 'This event was already reviewed');
  const svc = serviceClient();
  try {
    await rpc(svc, 'write_audit', { p_actor: s.userId, p_action: `admin.event_${decision}`, p_table: 'external_events', p_record: id,
      p_context: { title: ev.title, reason, before: { status: ev.status }, after: { status: next }, submitted_by: ev.submitted_by, degraded: true } });
  } catch (e) { log.error('event_review_audit_failed', { id, code: (e as { code?: string }).code }); }
  if (ev.submitted_by) {
    const n = decisionNotice(decision, ev.title, reason);
    const w = await svc.from('notifications').insert({ user_id: ev.submitted_by, ...n, data: { event_id: id, decision } });
    if (w.error) log.warn('event_review_notify_failed', { id, code: w.error.code });
  }
  return { id, status: next, reason, reviewed_at: new Date().toISOString(), degraded: true };
}
