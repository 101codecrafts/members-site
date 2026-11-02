import 'server-only';
import { randomBytes } from 'node:crypto';
import { env } from '@/lib/env';
import { hmacSha256, safeEqual } from '@/lib/crypto';
import { AppError } from '@/lib/errors';

/**
 * Meeting provider abstraction. Jitsi is the default (free, no account):
 * unguessable room names, embeddable with the External API
 * (https://<JITSI_DOMAIN>/external_api.js). Google Meet / Zoom / Teams use the
 * tutor's OAuth token (decrypted server-side) — TODO: OAuth apps + env vars.
 */
export type ProviderId = 'jitsi' | 'google_meet' | 'zoom' | 'teams';
export interface CreatedMeeting { join_url: string; host_url?: string; passcode?: string; external_id?: string }
export interface MeetingInput { title: string; starts_at: string; duration_minutes: number; accessToken?: string }

export function jitsiRoom(title: string): CreatedMeeting {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'class';
  const room = `101cc-${slug}-${randomBytes(9).toString('base64url')}`;
  return { join_url: `https://${env().JITSI_DOMAIN}/${room}`, external_id: room };
}

async function googleMeet(m: MeetingInput): Promise<CreatedMeeting> {
  // scope: https://www.googleapis.com/auth/calendar.events only
  const end = new Date(new Date(m.starts_at).getTime() + m.duration_minutes * 60_000).toISOString();
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
    method: 'POST', headers: { authorization: `Bearer ${m.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ summary: m.title, start: { dateTime: m.starts_at }, end: { dateTime: end },
      conferenceData: { createRequest: { requestId: randomBytes(12).toString('hex'), conferenceSolutionKey: { type: 'hangoutsMeet' } } } }),
  });
  if (!r.ok) throw new AppError('upstream_error', `Google Calendar ${r.status}`);
  const j = (await r.json()) as { id: string; hangoutLink?: string };
  if (!j.hangoutLink) throw new AppError('upstream_error', 'Google did not return a Meet link');
  return { join_url: j.hangoutLink, external_id: j.id };
}

async function zoom(m: MeetingInput): Promise<CreatedMeeting> {
  const r = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST', headers: { authorization: `Bearer ${m.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ topic: m.title, type: 2, start_time: m.starts_at, duration: m.duration_minutes, settings: { waiting_room: true, join_before_host: false } }),
  });
  if (!r.ok) throw new AppError('upstream_error', `Zoom ${r.status}`);
  const j = (await r.json()) as { id: number; join_url: string; start_url: string; password?: string };
  return { join_url: j.join_url, host_url: j.start_url, passcode: j.password, external_id: String(j.id) };
}

async function teams(m: MeetingInput): Promise<CreatedMeeting> {
  // Graph permission: OnlineMeetings.ReadWrite (delegated)
  const end = new Date(new Date(m.starts_at).getTime() + m.duration_minutes * 60_000).toISOString();
  const r = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
    method: 'POST', headers: { authorization: `Bearer ${m.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ subject: m.title, startDateTime: m.starts_at, endDateTime: end }),
  });
  if (!r.ok) throw new AppError('upstream_error', `Microsoft Graph ${r.status}`);
  const j = (await r.json()) as { id: string; joinWebUrl: string };
  return { join_url: j.joinWebUrl, external_id: j.id };
}

export async function createProviderMeeting(provider: ProviderId, m: MeetingInput): Promise<CreatedMeeting> {
  if (provider === 'jitsi') return jitsiRoom(m.title);
  if (!m.accessToken) throw new AppError('unprocessable', `Connect your ${provider.replace('_', ' ')} account first`);
  return provider === 'google_meet' ? googleMeet(m) : provider === 'zoom' ? zoom(m) : teams(m);
}

/** Zoom webhook signature: x-zm-signature = v0=HMAC_SHA256(secret, `v0:${ts}:${body}`), ts within 5 min. */
export function verifyZoomSignature(body: string, ts: string | null, sig: string | null, secret: string | undefined, now = Date.now()): boolean {
  if (!secret || !ts || !sig) return false;
  if (Math.abs(now - Number(ts) * 1000) > 300_000) return false;
  return safeEqual(sig, `v0=${hmacSha256(secret, `v0:${ts}:${body}`)}`);
}

/** .ics invite for Resend attachments. */
export function icsInvite(e: { uid: string; title: string; starts_at: string; duration_minutes: number; url: string; description?: string }): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(e.starts_at); const end = new Date(start.getTime() + e.duration_minutes * 60_000);
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//101 Codecrafts//EN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${e.uid}@101codecrafts`,
    `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.description ?? '')}`,
    `URL:${e.url}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
