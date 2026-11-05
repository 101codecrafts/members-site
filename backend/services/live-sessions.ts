import 'server-only';
import type { Session } from '@/lib/auth';
import type { Db } from '@/lib/supabase/user';
import { serviceClient } from '@/lib/supabase/admin';
import { unwrap } from '@/lib/http';
import { notFound, forbidden } from '@/lib/errors';
import { rpc } from '@/repositories/rpc';

/**
 * Live sessions (round 12): the front end's sessions.html contract over the real tables.
 * A "session" = a tutor_sessions row (RLS: scheduled/completed rows for members, own rows, admins) plus the provider of
 * its meeting (meetings.context_type = 'tutor_session', RLS-scoped) and whether the caller booked it. Nothing invented:
 * no rows -> an empty list; no meeting yet -> provider null.
 */
const COLS = 'id, tutor_id, kind, title, description, course_id, starts_at, duration_minutes, capacity, price_ugx, status, bookings_count';
type Row = { id: string; tutor_id: string; kind: string; title: string; description: string | null; course_id: string | null; starts_at: string;
  duration_minutes: number; capacity: number; price_ugx: number; status: string; bookings_count: number };

async function decorate(db: Db, me: string, rows: Row[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const tutorIds = [...new Set(rows.map((r) => r.tutor_id))];
  const [meetings, bookings, tutors] = await Promise.all([
    db.from('meetings').select('id, context_id, provider, status').eq('context_type', 'tutor_session').in('context_id', ids),
    db.from('session_bookings').select('session_id, status').eq('learner_id', me).in('session_id', ids),
    db.from('profiles').select('id, display_name').in('id', tutorIds),
  ]);
  const meet = new Map(unwrap(meetings).map((m) => [m.context_id, m]));
  const booked = new Map(unwrap(bookings).map((b) => [b.session_id, b.status]));
  const names = new Map(unwrap(tutors).map((p) => [p.id, p.display_name]));
  return rows.map((r) => {
    const m = meet.get(r.id);
    return {
      id: r.id, title: r.title, description: r.description, kind: r.kind, course_id: r.course_id, starts_at: r.starts_at,
      duration_min: r.duration_minutes, capacity: r.capacity, price_ugx: r.price_ugx, status: r.status, bookings_count: r.bookings_count,
      provider: m?.provider ?? null, meeting_id: m?.id ?? null,
      role: r.tutor_id === me ? 'tutor' : 'learner', booking: booked.get(r.id) ?? null, tutor: names.get(r.tutor_id) ?? null,
    };
  });
}

/** Upcoming (and in the last 3 hours, so a live one is still listed) sessions the caller can see, soonest first. */
export async function listSessions(s: Session, limit = 50) {
  const since = new Date(Date.now() - 3 * 3600_000).toISOString();
  const rows = unwrap(await s.db.from('tutor_sessions').select(COLS).in('status', ['scheduled']).gte('starts_at', since)
    .order('starts_at', { ascending: true }).limit(limit)) as Row[];
  return { sessions: await decorate(s.db, s.userId, rows) };
}

export async function getSession(s: Session, id: string) {
  const row = unwrap(await s.db.from('tutor_sessions').select(COLS).eq('id', id).maybeSingle()) as Row | null;
  if (!row) throw notFound('Session not found');
  return { session: (await decorate(s.db, s.userId, [row]))[0] };
}

/** Join: through the meeting (provider link, attendance logged, 15-minute window) when one exists, else the session's private link. */
export async function joinSession(s: Session, id: string) {
  const m = unwrap(await s.db.from('meetings').select('id, provider').eq('context_type', 'tutor_session').eq('context_id', id).limit(1)).at(0);
  if (m) {
    const j = (await rpc(s.db, 'meeting_join', { p_meeting: m.id })) as { provider: string; join_url: string; passcode: string | null; expires_at: string };
    return { provider: j.provider, url: j.join_url, passcode: j.passcode, embed: j.provider === 'jitsi', expires_at: j.expires_at };
  }
  const info = (await rpc(s.db, 'session_join_info', { p_session: id })) as { meeting_url: string | null; cal_com_url: string | null; starts_at: string };
  const url = info.meeting_url ?? info.cal_com_url;
  if (!url) throw notFound('The tutor has not added a meeting link yet');
  return { provider: null, url, passcode: null, embed: false, starts_at: info.starts_at };
}

/** Meeting providers for the caller. Tokens never leave the server (service-only table); only provider + account are read. */
const PROVIDERS = ['jitsi', 'google_meet', 'zoom', 'teams'] as const;
export async function listIntegrations(userId: string) {
  const rows = unwrap(await serviceClient().from('meeting_oauth_tokens').select('provider, account_email, expires_at').eq('user_id', userId));
  const byProvider = new Map(rows.map((r) => [r.provider as string, r]));
  return {
    integrations: PROVIDERS.map((p) => {
      if (p === 'jitsi') return { provider: p, connected: true, default: true, account: null, connectable: false };   // no account needed
      const r = byProvider.get(p);
      return { provider: p, connected: Boolean(r), default: false, account: r?.account_email ?? null, connectable: false };   // OAuth connect flow not built yet
    }),
  };
}

/** Organiser view of an event's registrations: the event's creator or an admin only (RLS would show anyone their own row). */
export async function eventAttendees(s: Session, eventId: string) {
  const ev = unwrap(await s.db.from('events').select('id, created_by').eq('id', eventId).maybeSingle());
  if (!ev) throw notFound('Event not found');
  const staff = s.roles.includes('admin') || s.roles.includes('super_admin');
  if (ev.created_by !== s.userId && !staff) throw forbidden('Only the organiser can see attendees');
  const regs = unwrap(await s.db.from('event_registrations').select('id, user_id, status, checked_in_at, created_at').eq('event_id', eventId)
    .in('status', ['registered', 'waitlisted', 'attended']).order('created_at', { ascending: true }).limit(2000));
  const people = regs.length ? unwrap(await s.db.from('profiles').select('id, display_name, education_level').in('id', regs.map((r) => r.user_id))) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return regs.map((r) => ({
    id: r.id, name: byId.get(r.user_id)?.display_name ?? 'Member', level: byId.get(r.user_id)?.education_level ?? null,
    status: r.status, checkedIn: Boolean(r.checked_in_at), checked_in_at: r.checked_in_at, registered_at: r.created_at, code: null,
  }));
}
