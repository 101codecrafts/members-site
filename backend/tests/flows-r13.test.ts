// r13 flows: guest sign-up carries a date of birth (L31/LG4), and the session explains a tutor's verification state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onboardingSubmit, tutorStatus, CONSENT_VERSION } from '../lib/onboarding.ts';

const consent = { terms: true, version: CONSENT_VERSION };

test('guest onboarding requires a DOB (YYYY-MM-DD) and still refuses forged keys', () => {
  assert.equal(onboardingSubmit.safeParse({ path: 'guest', consent }).success, false, 'no dob');
  assert.equal(onboardingSubmit.safeParse({ path: 'guest', dob: '12/04/2000', consent }).success, false, 'bad format');
  assert.equal(onboardingSubmit.safeParse({ path: 'guest', dob: '2000-12-04', consent }).success, true);
  assert.equal(onboardingSubmit.safeParse({ path: 'guest', dob: '2000-12-04', consent, role: 'admin' }).success, false, 'forged role');
});

test('tutorStatus: verified profile wins, else the latest application, null for non-tutors', () => {
  assert.equal(tutorStatus(['learner'], null, null), null);
  assert.deepEqual(tutorStatus(['learner', 'tutor'], { verification_status: 'verified' }, { status: 'pending', created_at: 't' }), { status: 'verified', note: null, applied_at: 't' });
  assert.equal(tutorStatus(['learner', 'tutor'], { verification_status: 'unverified' }, { status: 'pending' })?.status, 'pending');
  assert.equal(tutorStatus(['learner', 'tutor'], null, null)?.status, 'pending', 'role without an application row = still pending');
  const r = tutorStatus(['learner', 'tutor'], null, { status: 'rejected', review_note: 'Add a certificate link' });
  assert.equal(r?.status, 'rejected'); assert.equal(r?.note, 'Add a certificate link');
  assert.equal(tutorStatus(['learner'], null, { status: 'approved' })?.status, 'verified');
  assert.equal(tutorStatus(['learner', 'tutor'], null, { status: 'pending', review_note: 'secret admin note' })?.note, null, 'notes only for rejections');
});
