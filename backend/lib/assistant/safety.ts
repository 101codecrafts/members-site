import 'server-only';
import { SAFETY_CONTACTS } from './knowledge.ts';

/**
 * Light server-side safety signals (the model's system prompt carries the full rules).
 * - riskNote: when a message looks like self-harm / abuse / grooming, add a system note so the reply leads with care
 *   and the real Uganda contacts (we never block the user: blocking a child in distress is the worst outcome).
 * - injectionLike: obvious "ignore previous instructions" style text (logged as a flag only; the prompt handles it).
 */
const RISK = /\b(kill myself|killing myself|end my life|suicid\w*|self[- ]?harm|cut(ting)? myself|want to die|hurt myself|nobody would miss me|being abused|abus(e|ing) me|touch(ed|es|ing) me|send (him|her|them) (nudes|photos|pics)|asked me to send (a )?(nude|photo|pic)|meet (a|an|this) (stranger|man|woman) (i|we) met online|bullied|bullying)\b/i;
export function riskNote(text: string): string | undefined {
  if (!RISK.test(text)) return undefined;
  return `SAFETY NOTE: the user's last message may involve risk to their safety or wellbeing. Reply with warmth first, take it seriously, keep it short, encourage them to tell a trusted adult now, and include exactly these contacts: ${SAFETY_CONTACTS} Do not ask for personal details. Then offer to keep talking or help with something else.`;
}
const INJ = /\b(ignore (all |the )?(previous|prior|above) (instructions|rules)|system prompt|developer mode|jailbreak|DAN\b|act as (an? )?(unfiltered|uncensored)|reveal (your|the) (prompt|instructions))/i;
export const injectionLike = (text: string) => INJ.test(text);

/** Explain output: plain text only. Drop markdown images/links (exfiltration vectors) and raw URLs other than the source. */
export function cleanExplanation(text: string, sourceUrl?: string): string {
  let host = ''; try { host = sourceUrl ? new URL(sourceUrl).hostname : ''; } catch { /* ignore */ }
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/https?:\/\/[^\s)]+/g, (u) => { try { return host && new URL(u).hostname === host ? u : ''; } catch { return ''; } })
    .replace(/<[^>]{1,200}>/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
