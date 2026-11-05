/**
 * /auth onboarding payloads (round 11). Pure (zod only) so tests import it directly.
 * Every schema is .strict(): an unknown key — `role`, `roles`, `is_admin`, `plan`, `status`, `email` — is a 400,
 * so a forged role can never ride along with an onboarding submit. The role is chosen by the PATH, and the server
 * decides what that path grants (guest -> guest, learner -> learner, tutor -> tutor pending verification).
 */
import { z } from 'zod';

const phoneUg = z.string().trim().regex(/^\+?[0-9]{9,15}$/, 'Phone number: digits only, e.g. +2567XXXXXXXX');
const dob = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD');
const shortText = (max: number) => z.string().trim().min(1).max(max);
const tags = (maxItems: number) => z.array(z.string().trim().min(1).max(40)).max(maxItems);
const httpsUrl = z.string().trim().url().max(500).refine((u) => u.startsWith('https://'), 'Links must start with https://');

export const LEVELS = ['primary', 'o_level', 'a_level', 'university', 'professional'] as const;
export const GENDERS = ['female', 'male', 'other', 'prefer_not_to_say'] as const;
export const HEARD = ['friend', 'whatsapp', 'school', 'social', 'event', 'search', 'tutor', 'other'] as const;
export const EXPERIENCE = ['beginner', 'intermediate', 'advanced'] as const;
export const CONSENT_VERSION = '2026-11-05';

const consent = z.object({
  terms: z.literal(true, { errorMap: () => ({ message: 'Please accept the Terms and Privacy Policy' }) }),
  version: z.literal(CONSENT_VERSION),
}).strict();

export const guestBody = z.object({
  path: z.literal('guest'),
  consent,
}).strict();

const guardian = z.object({
  name: shortText(120),
  email: z.string().trim().email().max(254),
  relationship: z.enum(['parent', 'guardian', 'teacher', 'other']),
}).strict();

export const learnerBody = z.object({
  path: z.literal('learner'),
  name: shortText(80),
  dob,
  gender: z.enum(GENDERS),
  phone: phoneUg.optional(),                       // MoMo number; optional at sign-up, required at first payment
  level: z.enum(LEVELS),
  experience: z.enum(EXPERIENCE).optional(),
  interests: tags(12).min(1, 'Pick at least one interest'),
  goals: tags(6).min(1, 'Pick at least one goal'),
  goal_note: z.string().trim().max(500).optional(),
  heard_from: z.enum(HEARD),
  guardian: guardian.optional(),                   // required by the server when the DOB says under 18
  consent,
}).strict();

export const tutorBody = z.object({
  path: z.literal('tutor'),
  name: shortText(80),
  dob,                                             // tutors must be 18+ (checked server-side)
  gender: z.enum(GENDERS),
  phone: phoneUg,                                  // contact number
  levels: z.array(z.enum(LEVELS)).min(1).max(5),
  subjects: tags(15).min(1, 'Add at least one subject'),
  years_experience: z.number().int().min(0).max(60),
  bio: z.string().trim().min(50, 'Bio: at least 50 characters').max(2000),
  payout_phone: phoneUg,                           // MTN / Airtel MoMo; encrypted at rest
  payout_network: z.enum(['MTN', 'AIRTEL']),
  credentials: z.array(z.object({ title: shortText(120), url: httpsUrl.optional() }).strict()).min(1).max(8),
  linkedin_url: httpsUrl.optional(),
  heard_from: z.enum(HEARD),
  consent,
}).strict();

export const onboardingSubmit = z.discriminatedUnion('path', [guestBody, learnerBody, tutorBody]);
export type OnboardingSubmit = z.infer<typeof onboardingSubmit>;

/** Save-and-resume draft. Small and typed loosely on purpose (the final submit is the strict check). */
export const onboardingDraft = z.object({
  path: z.enum(['guest', 'learner', 'tutor']),
  step: z.string().regex(/^[a-z_]{2,24}$/),
  data: z.record(z.union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(120)).max(20), z.null()])).optional(),
}).strict().refine((d) => JSON.stringify(d).length <= 8000, 'Draft too large');
export type OnboardingDraft = z.infer<typeof onboardingDraft>;

/** Fields a minor's draft may keep server-side before guardian consent (DPPA s.8: collect the minimum). */
export const MINOR_DRAFT_KEYS = new Set(['name', 'dob', 'guardian_name', 'guardian_email', 'guardian_relationship']);
export function stripForMinor(d: OnboardingDraft): OnboardingDraft {
  const data = Object.fromEntries(Object.entries(d.data ?? {}).filter(([k]) => MINOR_DRAFT_KEYS.has(k)));
  return { ...d, data };
}
