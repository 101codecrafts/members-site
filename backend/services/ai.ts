import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';
import { rpc } from '@/repositories/rpc';
import { AppError } from '@/lib/errors';
import { chatComplete, moderate, SAFETY_SYSTEM, type ChatMessage } from '@/lib/ai';
import type { Session } from '@/lib/auth';

/**
 * GENERIC quota/usage API. Any server feature (chat, practice hints, the
 * ai-features assistant route, news summaries) wraps its model call with
 * reserveAi → provider call → commitAi. userId null = quota-free system job.
 */
export interface Reservation { allowed: boolean; usage_id?: string; reason?: string; plan?: string; remaining_requests?: number; resets_at?: string }
export async function reserveAi(userId: string | null, feature: string, estTokens = 1000): Promise<Reservation> {
  return (await rpc(serviceClient(), 'ai_reserve', { p_user: userId as string, p_feature: feature, p_est_tokens: estTokens })) as unknown as Reservation;
}
export async function commitAi(usageId: string, status: 'ok' | 'error' | 'blocked', r?: { provider?: string; model?: string; input_tokens?: number; output_tokens?: number; latency_ms?: number }) {
  await rpc(serviceClient(), 'ai_commit', { p_usage: usageId, p_status: status, p_provider: r?.provider, p_model: r?.model,
    p_input_tokens: r?.input_tokens ?? 0, p_output_tokens: r?.output_tokens ?? 0, p_latency_ms: r?.latency_ms });
}

async function isMinor(s: Session): Promise<boolean> {
  const r = (await s.db.from('profiles').select('is_minor').eq('id', s.userId).maybeSingle()).data;
  return Boolean(r?.is_minor);
}

/** Moderated, quota-metered chat for a signed-in member. */
export async function runAi(s: Session, feature: string, messages: ChatMessage[], opts: { system?: string; maxTokens?: number } = {}) {
  const minor = await isMinor(s);
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const mod = moderate(lastUser, minor);
  if (!mod.ok) {
    await rpc(serviceClient(), 'ai_log_moderation', { p_user: s.userId, p_feature: feature, p_is_minor: minor, p_category: mod.category ?? 'other', p_action: 'blocked_input' });
    if (mod.category === 'self_harm') return { text: "I'm really sorry you're feeling this way. You don't have to go through it alone — please talk to a trusted adult, or call the free Uganda child helpline on 116.", blocked: true };
    throw new AppError('unprocessable', 'That request is not allowed on 101 Codecrafts.');
  }
  const est = Math.min(8000, Math.ceil(messages.reduce((a, m) => a + m.content.length, 0) / 3) + (opts.maxTokens ?? 800));
  const res = await reserveAi(s.userId, feature, est);
  if (!res.allowed || !res.usage_id) {
    throw new AppError('rate_limited', res.reason === 'quota' ? `Daily AI limit reached for your ${res.plan ?? 'free'} plan. It resets at midnight (EAT).` : 'AI is unavailable right now.', res);
  }
  try {
    const out = await chatComplete([{ role: 'system', content: SAFETY_SYSTEM(minor) + (opts.system ? `\n\n${opts.system}` : '') }, ...messages.slice(-20)], { maxTokens: opts.maxTokens });
    const outMod = moderate(out.text, minor);
    if (!outMod.ok && outMod.category !== 'personal_info') {
      await commitAi(res.usage_id, 'blocked', out);
      await rpc(serviceClient(), 'ai_log_moderation', { p_user: s.userId, p_feature: feature, p_is_minor: minor, p_category: outMod.category ?? 'other', p_action: 'blocked_output' });
      throw new AppError('unprocessable', 'The answer was withheld by our safety filter.');
    }
    await commitAi(res.usage_id, 'ok', out);
    return { text: out.text, provider: out.provider, model: out.model, remaining_requests: res.remaining_requests };
  } catch (e) {
    if (!(e instanceof AppError && e.code === 'unprocessable')) await commitAi(res.usage_id, 'error').catch(() => {});
    throw e;
  }
}
