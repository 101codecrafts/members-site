import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';
import { rpc } from '@/repositories/rpc';
import { decryptSecret } from '@/lib/crypto';
import { env } from '@/lib/env';
import { createProviderMeeting, type ProviderId } from '@/lib/meetings';

/** Creates the provider meeting for a meeting row and stores the link in meeting_private (service role). */
export async function provisionMeeting(meeting: { id: string; host_id: string; provider: string; title: string; starts_at: string; duration_minutes: number }) {
  const db = serviceClient();
  let accessToken: string | undefined;
  if (meeting.provider !== 'jitsi') {
    const tok = (await db.from('meeting_oauth_tokens').select('access_enc').eq('user_id', meeting.host_id).eq('provider', meeting.provider as 'zoom').maybeSingle()).data;
    const key = env().MEETING_TOKEN_KEY;
    if (tok && key) accessToken = decryptSecret(tok.access_enc, { k1: key });   // TODO: refresh via refresh_enc when expired
  }
  const created = await createProviderMeeting(meeting.provider as ProviderId, { title: meeting.title, starts_at: meeting.starts_at, duration_minutes: meeting.duration_minutes, accessToken });
  await rpc(db, 'meeting_set_link', { p_meeting: meeting.id, p_join_url: created.join_url, p_host_url: created.host_url, p_passcode: created.passcode, p_external_id: created.external_id });
  return { provider: meeting.provider, ready: true };
}

export async function recordZoomEvent(evt: { event: string; payload?: { object?: { id?: string | number; participant?: { customer_key?: string; join_time?: string; leave_time?: string } } } }) {
  const o = evt.payload?.object;
  if (!o?.id) return;
  const map: Record<string, string> = { 'meeting.started': 'meeting.started', 'meeting.ended': 'meeting.ended', 'meeting.participant_joined': 'participant_joined', 'meeting.participant_left': 'participant_left' };
  const kind = map[evt.event];
  if (!kind) return;
  // customer_key = our Clerk user id, passed in the join URL (?customer_key=) by the client
  await rpc(serviceClient(), 'meeting_record_attendance', { p_provider: 'zoom', p_external_id: String(o.id), p_user: o.participant?.customer_key as string,
    p_event: kind, p_at: o.participant?.join_time ?? o.participant?.leave_time ?? new Date().toISOString() });
}
