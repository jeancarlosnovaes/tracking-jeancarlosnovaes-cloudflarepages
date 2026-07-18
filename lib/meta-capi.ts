import type { Env } from './env';

export interface MetaEventObject {
  event_name: string;
  event_time: number;
  event_id: string;
  event_source_url?: string;
  action_source: string;
  user_data: Record<string, unknown>;
  custom_data: Record<string, unknown>;
}

// Só envia — a formatação/hashing fica em lib/format-meta.ts
export async function postMetaEvents(events: MetaEventObject[], env: Env) {
  const body: Record<string, unknown> = { data: events };
  if (env.META_TEST_EVENT_CODE) {
    body.test_event_code = env.META_TEST_EVENT_CODE;
  }

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${env.META_PIXEL_ID}/events?access_token=${env.META_ACCESS_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, response: json };
}
