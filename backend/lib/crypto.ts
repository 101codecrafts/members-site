import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
export const hmacSha256 = (key: string, body: string, enc: 'hex' | 'base64' = 'hex'): string =>
  createHmac('sha256', key).update(body).digest(enc);

/** Constant-time string compare (webhook secrets, signatures). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/**
 * AES-256-GCM envelope for payout account numbers. Format:
 *   <keyId>:<iv b64>:<tag b64>:<ciphertext b64>
 * The key id prefix makes key rotation possible (decrypt with old, re-encrypt with new).
 */
export function encryptSecret(plain: string, keyB64: string, keyId: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('encryption key must be 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [keyId, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(envelope: string, keys: Record<string, string>): string {
  const [keyId, iv, tag, ct] = envelope.split(':');
  const keyB64 = keyId ? keys[keyId] : undefined;
  if (!keyB64 || !iv || !tag || !ct) throw new Error('unknown key id or malformed ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyB64, 'base64'), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}
