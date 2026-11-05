// Round 12 security (LG7): erase_user also redacts guardian contact details, tutor application PII and store KYC (one test each).
// Migration: 20261105122000_r12_erase_pii.sql
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, t } = helpers;

export const tests = [
  t('r12: erasing a minor keeps the consent evidence row but removes the guardian contact details', async (db) => {
    await as(db, 'postgres');
    const before = await one(db, `select count(*)::int n from public.guardian_consents where user_id=$1 and guardian_phone is not null`, [U.kid]);
    assert.ok(before.n >= 1, 'fixture has a guardian phone');
    await as(db, 'service');
    await q(db, `select public.erase_user($1, null)`, [U.kid]);
    await as(db, 'postgres');
    const rows = await q(db, `select guardian_name, guardian_email, guardian_phone, token_hash, verified_at, consent_version from public.guardian_consents where user_id=$1`, [U.kid]);
    assert.ok(rows.length >= 1, 'evidence row kept');
    for (const r of rows) {
      assert.equal(r.guardian_phone, null); assert.equal(r.guardian_email, 'erased@erased.invalid'); assert.equal(r.guardian_name, 'Erased'); assert.equal(r.token_hash, null);
    }
  }),

  t('r12: erasing a tutor removes application PII (ID document path, bio, links)', async (db) => {
    await as(db, 'postgres');
    await q(db, `insert into public.tutor_applications (user_id, bio, expertise, credentials, linkedin_url, id_document_path)
                 values ($1, 'I teach Python to secondary school students in Kampala every weekend.', '{python}', '[]'::jsonb, 'https://linkedin.com/in/x', 'tutor-docs/x/id.pdf')`, [U.bob]);
    await as(db, 'service');
    await q(db, `select public.erase_user($1, null)`, [U.bob]);
    await as(db, 'postgres');
    const a = await one(db, `select bio, linkedin_url, id_document_path from public.tutor_applications where user_id=$1`, [U.bob]);
    assert.match(a.bio, /^\[erased\]/); assert.equal(a.linkedin_url, null); assert.equal(a.id_document_path, null);
  }),

  t('r12: erasing a store owner removes store KYC (legal name, payout phone, KYC document paths) but leaves other stores alone', async (db) => {
    await as(db, 'postgres');
    const mine = await one(db, `insert into public.mkt_stores (owner_id, slug, name) values ($1,'alice-kyc-shop','Alice Shop') returning id`, [U.alice]);
    const other = await one(db, `insert into public.mkt_stores (owner_id, slug, name) values ($1,'tutora-kyc-shop','Amina Shop') returning id`, [U.tutorA]);
    await q(db, `insert into public.mkt_store_private (store_id, legal_name, phone, kyc_documents) values
                   ($1,'Alice Nakato','+256700000001','{kyc/alice/id-front.jpg,kyc/alice/id-back.jpg}'),
                   ($2,'Amina Tutor','+256700000002','{kyc/amina/id.jpg}')`, [mine.id, other.id]);
    await as(db, 'service');
    await q(db, `select public.erase_user($1, null)`, [U.alice]);
    await as(db, 'postgres');
    const a = await one(db, `select legal_name, phone, kyc_documents from public.mkt_store_private where store_id=$1`, [mine.id]);
    assert.equal(a.legal_name, null); assert.equal(a.phone, null); assert.deepEqual(a.kyc_documents, []);
    const b = await one(db, `select legal_name, phone, kyc_documents from public.mkt_store_private where store_id=$1`, [other.id]);
    assert.equal(b.legal_name, 'Amina Tutor'); assert.equal(b.phone, '+256700000002'); assert.deepEqual(b.kyc_documents, ['kyc/amina/id.jpg']);
  }),
];
