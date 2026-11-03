import { route, preflight, unwrap, unwrapMaybe } from '@/lib/http';
import { optionalSession } from '@/lib/auth';
import { notFound } from '@/lib/errors';
/** Statement + sample tests; editorial and hints only when allowed (never during a live/upcoming contest). */
export const GET = route<{ slug: string }>(async ({ params }) => {
  const { db, session } = await optionalSession();
  const p = unwrapMaybe(await db.from('problems').select('id, slug, title, statement_md, input_format_md, output_format_md, constraints_md, difficulty, topic_ids, tags, company_tags, starter_code, languages, time_limit_ms, memory_limit_kb, solved_count, attempts_count').eq('slug', params.slug).maybeSingle());
  if (!p) throw notFound('Problem not found');
  const [samples, editorial, hints, solved] = await Promise.all([
    db.from('test_cases').select('ord, input, expected_output, explanation_md').eq('problem_id', p.id).eq('is_sample', true).order('ord'),
    db.from('problem_editorials').select('editorial_md, solution_code').eq('problem_id', p.id).maybeSingle(),
    db.from('problem_hints').select('ord, body_md').eq('problem_id', p.id).order('ord'),
    session ? db.from('practice_solved').select('solved_at').eq('problem_id', p.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  return { ...p, samples: unwrap(samples), editorial: editorial.data ?? null, hints: hints.data ?? [], solved: Boolean(solved.data) };
});
export const OPTIONS = preflight;
