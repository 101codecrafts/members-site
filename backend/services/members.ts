import 'server-only';
import type { z } from 'zod';
import type { Session } from '@/lib/auth';
import type { onboardingBody, guardianBody, payoutMethodBody } from '@/lib/validation';
import { serviceClient } from '@/lib/supabase/admin';
import { encryptSecret, randomToken, sha256 } from '@/lib/crypto';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { unwrap } from '@/lib/http';
import { sendEmails, templates } from '@/lib/email';
import { afterGuardianVerified } from '@/services/auth-roles';

/** Onboarding: role intent, interests, path, level. DOB is set server-side (it drives minor protections). */
export async function saveOnboarding(s: Session, input: z.infer<typeof onboardingBody>) {
  const { date_of_birth, education_level, complete, ...rest } = input;
  if (education_level) unwrap(await s.db.from('profiles').update({ education_level }).eq('id', s.userId).select('id').single());
  if (date_of_birth) await setDateOfBirthOnce(s.userId, date_of_birth);
  return unwrap(await s.db.from('onboarding_state').upsert({ user_id: s.userId, ...rest, ...(complete ? { completed_at: new Date().toISOString() } : {}) }, { onConflict: 'user_id' })
    .select('*').single());
}

async function setDateOfBirthOnce(userId: string, dob: string): Promise<void> {
  const d = new Date(dob);
  const ageYears = (Date.now() - d.getTime()) / (365.25 * 864e5);
  if (isNaN(+d) || ageYears < 5 || ageYears > 100) throw new AppError('bad_request', 'Invalid date of birth');
  const db = serviceClient();
  const cur = (await db.from('profile_private').select('date_of_birth').eq('user_id', userId).maybeSingle()).data;
  if (cur?.date_of_birth) return;                       // changes need an admin (guard_dob)
  const { error } = await db.from('profile_private').upsert({ user_id: userId, date_of_birth: dob }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** Under-18s: record guardian, email/SMS a one-time verification link (7 days). */
export async function startGuardianConsent(s: Session, input: z.infer<typeof guardianBody>) {
  const e = env();
  await setDateOfBirthOnce(s.userId, input.date_of_birth);
  const token = randomToken(32);
  const db = serviceClient();
  const row = unwrap(await db.from('guardian_consents').insert({ user_id: s.userId, guardian_name: input.guardian_name, guardian_email: input.guardian_email ?? null,
    guardian_phone: input.guardian_phone ?? null, relationship: input.relationship, token_hash: sha256(token),
    token_expires_at: new Date(Date.now() + 7 * 864e5).toISOString() }).select('id').single());
  const child = (await db.from('profiles').select('display_name').eq('id', s.userId).single()).data?.display_name || 'Your child';
  if (input.guardian_email) {
    await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, [{ to: input.guardian_email, ...templates.guardianConsent({ guardian: input.guardian_name, child,
      url: `${e.APP_URL}/api/v1/guardian/verify?token=${token}` }) }]);
  }
  // SMS delivery (Africa's Talking etc.) is a TODO; phone-only guardians are verified manually by an admin (admin_verify_guardian).
  return { id: row.id, status: 'pending_guardian', channel: input.guardian_email ? 'email' : 'manual' };
}

export async function verifyGuardianToken(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return false;
  const db = serviceClient();
  const row = (await db.from('guardian_consents').update({ verified_at: new Date().toISOString(), verification_method: 'email_link', token_hash: null })
    .eq('token_hash', sha256(token)).gt('token_expires_at', new Date().toISOString()).is('verified_at', null).select('user_id').maybeSingle()).data;
  if (row?.user_id) await afterGuardianVerified(String(row.user_id));   // r11: activate + "email plus" confirmation
  return Boolean(row);
}

/** Payout destination: account number encrypted with AES-256-GCM before it touches the DB; only last 4 stored in clear. */
export async function addPayoutMethod(s: Session, input: z.infer<typeof payoutMethodBody>) {
  const e = env();
  if (!e.PAYOUT_ENCRYPTION_KEY) throw new AppError('upstream_error', 'Payouts are not configured yet');
  const account = input.kind === 'mobile_money' ? input.msisdn.replace(/^0/, '256').replace(/^\+/, '') : input.account_number;
  const db = serviceClient();
  const hasDefault = (await db.from('payout_methods').select('id').eq('tutor_id', s.userId).eq('is_default', true).is('deleted_at', null).limit(1)).data?.length;
  const row = unwrap(await db.from('payout_methods').insert({
    tutor_id: s.userId, kind: input.kind, provider_code: input.kind === 'mobile_money' ? 'MPS' : input.bank_code, network: input.kind === 'mobile_money' ? input.network : null,
    account_name: input.account_name, account_last4: account.slice(-4), account_ciphertext: encryptSecret(account, e.PAYOUT_ENCRYPTION_KEY, e.PAYOUT_ENCRYPTION_KEY_ID),
    is_default: !hasDefault,
  }).select('id, kind, network, account_name, account_last4, is_default').single());
  if (!hasDefault) await db.from('tutor_profiles').update({ default_payout_method_id: row.id }).eq('user_id', s.userId);
  return row;
}
