import 'server-only';
import type { Db } from '@/lib/supabase/user';
import { fromPostgres, notFound } from '@/lib/errors';
import { rpc, type RpcArgs } from '@/repositories/rpc';
import type { Database } from '@/types/database';

/**
 * Course builder data access (r11). types/database.ts now includes 20261105020000_course_builder.sql (regenerated from
 * staging in round 12), so these calls are fully typed; `loose` stays as an identity helper so call sites read the same.
 */
type Res<T = unknown> = { data: T; error: { code?: string; message: string } | null };
type Fns = Database['public']['Functions'];
export const loose = (db: Db): Db => db;

export async function run<T = unknown>(p: PromiseLike<Res>): Promise<T> {
  const { data, error } = await p;
  if (error) throw fromPostgres(error);
  return data as T;
}
export async function rpcLoose<T = unknown, N extends keyof Fns = keyof Fns>(db: Db, name: N, args: RpcArgs<N> = {} as RpcArgs<N>): Promise<T> {
  try { return (await rpc(db, name, args)) as T; } catch (e) { throw fromPostgres(e as { code?: string; message?: string }); }
}

export const COURSE_COLS = 'id, slug, title, summary, description, level, cover_url, status, review_note, is_free, price_ugx, requested_price_ugx, tags, tutor_id, updated_at, published_at';

/** Full builder tree for one course the caller may see (owner / admin by RLS). */
export async function courseTree(db: Db, courseId: string) {
  const l = loose(db);
  const course = await run<Record<string, unknown> | null>(l.from('courses').select(COURSE_COLS).eq('id', courseId).is('deleted_at', null).maybeSingle());
  if (!course) throw notFound('Course not found');
  const [modules, lessons, subs] = await Promise.all([
    run<Array<Record<string, unknown>>>(l.from('course_modules').select('id, title, summary, position, approved').eq('course_id', courseId).order('position')),
    run<Array<Record<string, unknown>>>(l.from('lessons').select('id, module_id, title, kind, position, payload, content_md, video_url, duration_minutes, is_preview, approved').eq('course_id', courseId).order('position')),
    run<Array<Record<string, unknown>>>(l.from('course_submissions').select('id, kind, status, reason, requested_price_ugx, approved_price_ugx, created_at, reviewed_at').eq('course_id', courseId).order('created_at', { ascending: false }).limit(10)),
  ]);
  const quizIds = lessons.filter((x) => x.kind === 'quiz').map((x) => x.id as string);
  const keys = quizIds.length ? await run<Array<{ lesson_id: string; answers: number[] }>>(l.from('lesson_quiz_keys').select('lesson_id, answers').in('lesson_id', quizIds)).catch(() => []) : [];
  const keyOf = new Map(keys.map((k) => [k.lesson_id, k.answers]));
  const withKeys = lessons.map((x) => (keyOf.has(x.id as string) ? { ...x, answers: keyOf.get(x.id as string) } : x));
  return {
    course,
    modules: modules.map((m) => ({ ...m, lessons: withKeys.filter((x) => x.module_id === m.id) })),
    legacy_lessons: withKeys.filter((x) => !x.module_id),
    submissions: subs,
  };
}

export async function nextPosition(db: Db, table: 'course_modules' | 'lessons', courseId: string): Promise<number> {
  const rows = await run<Array<{ position: number }>>(loose(db).from(table).select('position').eq('course_id', courseId).order('position', { ascending: false }).limit(1));
  return rows[0] ? rows[0].position + 1 : 0;
}
