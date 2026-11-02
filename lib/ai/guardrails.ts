/**
 * Lightweight, deterministic guardrails that run BEFORE any model call.
 * They are a first line of defence; the system prompt and tool design are the second.
 * Deliberately conservative: they block clear abuse and flag likely injection,
 * but leave nuanced on/off-topic judgement to the model (which is told to refuse).
 */

export type GuardVerdict =
  | { action: "allow"; flags: string[] }
  | { action: "block"; reason: "harmful" | "secrets" | "too_long" | "empty"; message: string; flags: string[] };

export const MAX_USER_MESSAGE_CHARS = 4000;

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions|prompts?|rules|messages)/i,
  /disregard\s+(all\s+|the\s+)?(previous|prior|above|system)\s+/i,
  /(reveal|show|print|repeat|leak|output)\s+(me\s+)?(your|the)\s+(system\s+prompt|hidden\s+instructions|instructions|prompt|rules)/i,
  /you\s+are\s+now\s+(?!a\s+learner)/i,
  /\b(DAN|developer\s+mode|jailbreak)\b/i,
  /pretend\s+(that\s+)?you\s+(have\s+no|are\s+not\s+bound)/i,
  /<\/?\s*(system|assistant|knowledge|instructions)\s*>/i,
  /^\s*(system|developer)\s*:/im,
];

/**
 * Harmful requests we refuse outright. Cybersecurity is a learning path, so we
 * allow defensive/educational security questions and block only clearly
 * malicious, operational asks.
 */
const HARMFUL_PATTERNS: RegExp[] = [
  /\b(make|build|create|write|code)\b.{0,40}\b(ransomware|keylogger|botnet|credential\s*stealer|info-?stealer)\b/i,
  /\bhack\s+(into\s+)?(my\s+)?(girlfriend|boyfriend|wife|husband|ex|someone'?s?|a\s+person'?s?)\b/i,
  /\b(steal|phish)\b.{0,30}\b(passwords?|credentials|mobile\s*money|bank)\b/i,
  /\b(bypass|crack)\b.{0,30}\b(mtn|airtel|mobile\s*money|bank|flutterwave)\b/i,
  /\b(child\s+sexual|csam)\b/i,
  /\b(make|build)\b.{0,20}\b(bomb|explosive|weapon)\b/i,
  /\bkill\s+(myself|someone)\b/i,
];

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/, // OpenAI-style keys
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bghp_[A-Za-z0-9]{30,}\b/, // GitHub token
  /\bFLWSECK(_TEST)?-[A-Za-z0-9-]{10,}\b/, // Flutterwave secret
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:\d[ -]?){13,19}\b(?=.*\b(cvv|card|visa|mastercard)\b)/i, // card number with card context
];

export function detectInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

export function checkUserMessage(text: string): GuardVerdict {
  const flags: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) return { action: "block", reason: "empty", message: "Please type a question.", flags };
  if (trimmed.length > MAX_USER_MESSAGE_CHARS) {
    return {
      action: "block",
      reason: "too_long",
      message: `That message is too long (max ${MAX_USER_MESSAGE_CHARS} characters). Try a shorter question or paste a smaller code snippet.`,
      flags,
    };
  }
  if (SECRET_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      action: "block",
      reason: "secrets",
      message:
        "It looks like your message contains a password, API key, private key or card number. Please remove it — never share secrets in chat. If it was a real key, revoke/rotate it now.",
      flags: ["secret"],
    };
  }
  if (HARMFUL_PATTERNS.some((p) => p.test(trimmed))) {
    return {
      action: "block",
      reason: "harmful",
      message:
        "I can't help with that. I'm happy to help you learn security the legal, ethical way — for example how attacks work so you can defend against them, or how to practise on legal labs and CTFs.",
      flags: ["harmful"],
    };
  }
  if (detectInjection(trimmed)) flags.push("prompt_injection_suspected");
  return { action: "allow", flags };
}

/** Wrap untrusted user-supplied blobs (code, board text) so the model treats them as data. */
export function fenceUntrusted(label: string, content: string, maxChars = 6000): string {
  const safe = content.replace(/<\/?untrusted[^>]*>/gi, "").slice(0, maxChars);
  return `<untrusted source="${label.replace(/[^a-z0-9_-]/gi, "")}">\n${safe}\n</untrusted>`;
}
