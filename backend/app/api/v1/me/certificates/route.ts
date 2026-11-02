import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireUser } from '@/lib/auth';
export const GET = route(async () => {
  const s = await requireUser();
  const rows = unwrap(await s.db.from('certificates').select('id, verify_code, title, issued_at, pdf_path, revoked_at').order('issued_at', { ascending: false }));
  const out = [];
  for (const c of rows) {
    const signed = c.pdf_path ? (await s.db.storage.from('certificates').createSignedUrl(c.pdf_path, 600)).data?.signedUrl ?? null : null;
    out.push({ ...c, pdf_url: signed, verify_url: `/verify/${c.verify_code}` });
  }
  return out;
});
export const OPTIONS = preflight;
