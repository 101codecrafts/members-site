/**
 * Structured JSON logger (one line per event → Vercel log drains / any
 * aggregator). Secrets and PII keys are redacted recursively.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|account_?number|ciphertext|email|phone|signature/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = REDACT.test(k) ? '[redacted]' : redact(v, depth + 1);
    return out;
  }
  return value;
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(ctx: Record<string, unknown>): Logger;
}

export function createLogger(base: Record<string, unknown> = {}): Logger {
  const min = order[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 20;
  const emit = (level: Level, msg: string, ctx?: Record<string, unknown>) => {
    if (order[level] < min) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(redact({ ...base, ...ctx }) as object) });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };
  return {
    debug: (m, c) => emit('debug', m, c),
    info: (m, c) => emit('info', m, c),
    warn: (m, c) => emit('warn', m, c),
    error: (m, c) => emit('error', m, c),
    child: (c) => createLogger({ ...base, ...c }),
  };
}

export const logger = createLogger({ service: 'api' });
