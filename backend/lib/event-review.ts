import { z } from 'zod';

/**
 * Admin review of member-submitted events (external_events), round 12.
 *   GET  /api/v1/admin/events/pending        admin / root_admin with scope 'approvals', paginated, oldest first
 *   POST /api/v1/admin/events/:id/approve    { reason?: ≤300 }   → published
 *   POST /api/v1/admin/events/:id/reject     { reason: 3..300 }  → rejected
 * The decision runs in public.admin_review_external_event (migration 20261106030000, NOT applied yet): row lock,
 * pending-only, audit_log before → after, in-app notification to the submitter. While that migration is unapplied the
 * service falls back to a status-only update + a server audit row + a notification (see services/event-review.ts).
 * Pure helpers live here so unit tests can load them without the server runtime.
 */
export const REASON_MAX = 300;
export const approveBody = z.object({ reason: z.string().trim().max(REASON_MAX).nullish() });
export const rejectBody = z.object({ reason: z.string({ required_error: 'A reason is required to reject' }).trim().min(3, 'Write a reason (3+ characters)').max(REASON_MAX) });
export type Decision = 'approve' | 'reject';

/** Columns every applied schema has (round 11) and the ones 20261106030000 adds. */
export const BASE_COLS = 'id, title, organiser, organiser_name, mode, venue, city, starts_at, ends_at, timezone, price_text, source, source_url, status, submitted_by, created_at';
export const EXT_COLS = 'event_type, price, currency, description';

/** A missing function / table / column / enum value: the database is behind the code (migration not applied). */
const OUTDATED = new Set(['42883', '42P01', '42703', '42704', 'PGRST202', 'PGRST204', 'PGRST205']);
export const isSchemaOutdated = (e: unknown): boolean => !!e && typeof e === 'object' && OUTDATED.has(String((e as { code?: unknown }).code ?? ''));

export interface PendingRow {
  id: string; title: string; organiser: string; organiser_name: string | null; mode: string; venue: string | null; city: string | null;
  starts_at: string; ends_at: string | null; timezone: string; price_text: string | null; source: string; source_url: string; status: string;
  submitted_by: string | null; created_at: string; event_type?: string | null; price?: number | string | null; currency?: string | null; description?: string | null;
}
export interface Person { id: string; display_name: string | null; username: string | null }

/** One queue item: the event, who sent it and when; the extra form fields only when the migration is applied. */
export function toPendingItem(r: PendingRow, people: Person[], contacts: Record<string, string>, extended: boolean) {
  const who = r.submitted_by ? people.find((p) => p.id === r.submitted_by) : undefined;
  return {
    id: r.id, title: r.title, organiser: r.organiser, organiser_name: r.organiser_name, mode: r.mode, venue: r.venue, city: r.city,
    starts_at: r.starts_at, ends_at: r.ends_at, timezone: r.timezone, link: r.source_url, source: r.source, price_text: r.price_text,
    submitted_at: r.created_at, status: r.status,
    submitter: r.submitted_by ? { id: r.submitted_by, display_name: who?.display_name ?? null, username: who?.username ?? null } : null,
    ...(extended ? { event_type: r.event_type ?? null, price: r.price == null ? null : Number(r.price), currency: r.currency ?? null, description: r.description ?? null,
                     contact_email: contacts[r.id] ?? null } : {}),
  };
}

/** The in-app notice the submitter gets (same wording as the SQL function). */
export function decisionNotice(decision: Decision, title: string, reason: string | null) {
  const t = title.slice(0, 140);
  return { type: 'event.review', title: decision === 'approve' ? `Your event "${t}" is live` : `Your event "${t}" was not approved`, body: reason || null, link: '/events.html' };
}
