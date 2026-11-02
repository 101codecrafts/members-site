import 'server-only';

/** Expo push (covers FCM on Android and APNs on iOS through one API). */
export interface PushMessage { to: string; title: string; body?: string; data?: Record<string, string> }

export async function sendExpoPush(messages: PushMessage[], accessToken?: string): Promise<{ invalidTokens: string[] }> {
  const invalid: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default' }))), signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => ({ data: [] }))) as { data?: { status: string; details?: { error?: string } }[] };
    json.data?.forEach((r, idx) => { if (r.details?.error === 'DeviceNotRegistered') invalid.push(batch[idx]!.to); });
  }
  return { invalidTokens: invalid };
}
