import { z } from 'zod';

/** Course builder input (r11). Shapes mirror the DB checks in 20261105020000_course_builder.sql. */

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
/** Accepts a YouTube id or any youtube.com / youtu.be / nocookie URL; returns the 11-char id or null. */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  if (YT_ID.test(s)) return s;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (['youtube.com', 'youtube-nocookie.com', 'music.youtube.com'].includes(host)) {
    const p = u.pathname.split('/').filter(Boolean);
    id = p[0] === 'watch' ? u.searchParams.get('v') : ['embed', 'shorts', 'live', 'v'].includes(p[0]) ? p[1] ?? null : null;
  }
  return id && YT_ID.test(id) ? id : null;
}

/** ISBN-10 / ISBN-13 with a valid check digit (hyphens/spaces ignored). */
export function normaliseIsbn(input: string): string | null {
  const s = input.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = s.split('').reduce((a, ch, i) => a + (ch === 'X' ? 10 : +ch) * (10 - i), 0);
    return sum % 11 === 0 ? s : null;
  }
  if (/^\d{13}$/.test(s)) {
    const sum = s.split('').reduce((a, ch, i) => a + +ch * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0 ? s : null;
  }
  return null;
}

/** Structural link-safety check, same rules as app.link_verdict() in SQL. */
const SHORTENERS = /(^|\.)(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rb\.gy|shorturl\.at|tiny\.cc)$/i;
export function linkVerdict(raw: string): 'ok' | 'not_https' | 'has_credentials' | 'ip_address' | 'private_host' | 'shortener' | 'too_long' | 'invalid' {
  if (raw.length > 2048) return 'too_long';
  let u: URL;
  try { u = new URL(raw); } catch { return 'invalid'; }
  if (u.protocol !== 'https:') return 'not_https';
  if (u.username || u.password) return 'has_credentials';
  const h = u.hostname.toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith('[')) return 'ip_address';
  if (/(^|\.)(localhost|local|internal|lan|home\.arpa)$/.test(h)) return 'private_host';
  if (SHORTENERS.test(h)) return 'shortener';
  return 'ok';
}
export const safeHttpsUrl = z.string().max(2048).refine((u) => linkVerdict(u) === 'ok', (u) => ({ message: `Unsafe or invalid link (${linkVerdict(u)})` }));

const title = z.string().trim().min(2).max(140);
const base = { title, is_preview: z.boolean().optional(), duration_minutes: z.number().int().min(0).max(100000).optional() };
const QuizQuestion = z.object({
  q: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
  answer: z.number().int().min(0),
}).refine((x) => x.answer < x.options.length, 'answer must point at one of the options');

const LessonRaw = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('video'), ...base, youtube: z.string().min(1).max(2048) }),
  z.object({ kind: z.literal('book'), ...base, isbn: z.string().max(20).optional(), url: safeHttpsUrl.optional(), note: z.string().max(5000).optional(),
             book_title: z.string().max(300).optional(), author: z.string().max(200).optional(), cover: safeHttpsUrl.optional() }),
  z.object({ kind: z.literal('text'), ...base, content_md: z.string().min(1).max(100000) }),
  z.object({ kind: z.literal('file'), ...base, url: safeHttpsUrl, file_name: z.string().max(200).optional(), note: z.string().max(5000).optional() }),
  z.object({ kind: z.literal('quiz'), ...base, questions: z.array(QuizQuestion).min(1).max(50), pass_pct: z.number().int().min(0).max(100).default(70) }),
]);
type Row = { kind: 'video' | 'book' | 'text' | 'file' | 'quiz'; title: string; is_preview?: boolean; duration_minutes?: number;
             content_md: string | null; payload: Record<string, unknown>; answers?: number[] };
export const LessonInput = LessonRaw.transform((x, ctx): Row => {
  const common = { title: x.title, is_preview: x.is_preview, duration_minutes: x.duration_minutes };
  switch (x.kind) {
    case 'video': {
      const id = youtubeId(x.youtube);
      if (!id) { ctx.addIssue({ code: 'custom', message: 'Not a YouTube link or id', path: ['youtube'] }); return z.NEVER; }
      return { kind: 'video', ...common, payload: { youtube_id: id }, content_md: null };
    }
    case 'book': {
      const isbn = x.isbn ? normaliseIsbn(x.isbn) : null;
      if (x.isbn && !isbn) { ctx.addIssue({ code: 'custom', message: 'ISBN check digit is wrong', path: ['isbn'] }); return z.NEVER; }
      if (!isbn && !x.url) { ctx.addIssue({ code: 'custom', message: 'Give an ISBN or a link', path: ['isbn'] }); return z.NEVER; }
      return { kind: 'book', ...common, content_md: x.note ?? null,
               payload: { ...(isbn ? { isbn } : {}), ...(x.url ? { url: x.url } : {}), ...(x.book_title ? { book_title: x.book_title } : {}), ...(x.author ? { author: x.author } : {}), ...(x.cover ? { cover: x.cover } : {}) } };
    }
    case 'text': return { kind: 'text', ...common, content_md: x.content_md, payload: {} };
    case 'file': return { kind: 'file', ...common, content_md: x.note ?? null, payload: { url: x.url, ...(x.file_name ? { file_name: x.file_name } : {}) } };
    case 'quiz': return { kind: 'quiz', ...common, content_md: null,
                          payload: { pass_pct: x.pass_pct, questions: x.questions.map(({ q, options }) => ({ q, options })) },
                          answers: x.questions.map((qq) => qq.answer) };
  }
});
export type LessonRow = z.output<typeof LessonInput>;

export const ModuleInput = z.object({ title, summary: z.string().max(1000).optional() });
export const ModulePatch = ModuleInput.partial().strict();

/** Builder course fields. Price is a REQUEST (admins set the live price). Slug is generated when missing. */
export const BuilderCourseInput = z.object({
  title: z.string().trim().min(3).max(140),
  summary: z.string().trim().max(300).optional(),
  description: z.string().max(20000).optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  cover_url: safeHttpsUrl.optional(),
  tags: z.array(z.string().max(40)).max(20).default([]),
  pricing: z.discriminatedUnion('mode', [z.object({ mode: z.literal('free') }), z.object({ mode: z.literal('paid'), price_ugx: z.number().int().min(1000).max(100_000_000) })]).optional(),
});
export const BuilderCoursePatch = BuilderCourseInput.partial().strict();

export function slugify(t: string): string {
  const s = t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'course';
  return `${s}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Map builder course input to DB columns (requested_price_ugx, never price_ugx / is_free). */
export function courseColumns(c: z.output<typeof BuilderCoursePatch>): Record<string, unknown> {
  const { pricing, ...rest } = c;
  const out: Record<string, unknown> = { ...rest };
  if (pricing) out.requested_price_ugx = pricing.mode === 'free' ? 0 : pricing.price_ugx;
  return out;
}

export const ReorderInput = z.object({ modules: z.array(z.string().uuid()).max(200), lessons: z.record(z.string().uuid(), z.array(z.string().uuid()).max(500)).default({}) });
export const SubmitInput = z.object({ note: z.string().max(1000).optional() });
export const SubmissionDecision = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().max(2000).optional(), price_ugx: z.number().int().min(0).max(100_000_000).optional() })
  .refine((d) => d.decision !== 'rejected' || (d.reason ?? '').trim().length >= 5, { message: 'Give the tutor a reason (5+ characters)', path: ['reason'] });
