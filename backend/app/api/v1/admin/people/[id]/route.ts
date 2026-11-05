import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { clerkId } from '@/lib/validation';
import { call } from '@/services/admin-console';
import { manageBody } from '@/lib/admin-validation';
import { syncClerkBan } from '@/services/identity';
/** Scope: users. Role (learner/tutor), status (suspend/ban/restore), plan override, guardian consent. All audited in SQL. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const id = clerkId.parse(params.id);
  const b = await body(req, manageBody);
  switch (b.action) {
    case 'role': await call(s.db, 'admin_set_user_role', { p_user: id, p_role: b.role, p_grant: b.grant, p_reason: b.reason ?? null }); return { ok: true };
    case 'status': {
      const p = await call<{ account_status: string }>(s.db, 'admin_set_user_status', { p_user: id, p_status: b.status, p_reason: b.reason ?? null, p_until: b.until ?? null });
      await syncClerkBan(id, b.status);
      return { id, account_status: p.account_status };
    }
    case 'plan': return call(s.db, 'admin_set_user_plan', { p_user: id, p_audience: b.audience, p_plan: b.plan, p_reason: b.reason });
    case 'guardian_verify': await call(s.db, 'admin_verify_guardian', { p_consent_id: b.consent_id }); return { ok: true };
    case 'guardian_revoke': await call(s.db, 'admin_revoke_guardian', { p_consent_id: b.consent_id, p_reason: b.reason }); return { ok: true };
  }
});
export const OPTIONS = preflight;
