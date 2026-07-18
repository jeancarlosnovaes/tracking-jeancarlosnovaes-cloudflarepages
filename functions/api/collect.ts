import type { PagesFunction } from '@cloudflare/workers-types';
import { getSupabase } from '../../lib/supabase';
import { dispatchEvent } from '../../lib/dispatch-event';
import type { NormalizedEvent } from '../../lib/normalized-event';
import type { CanonicalEventName } from '../../lib/event-catalog';
import type { Env } from '../../lib/env';

// site principal (jeancarlosnovaes.com) chamando a API num subdomínio
// separado (fbapi.jeancarlosnovaes.com) é uma origem diferente — sem esse
// header o navegador bloqueia a leitura da resposta pelo fetch (o
// navigator.sendBeacon não é afetado, mas deixamos os dois cobertos).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface CollectPayload {
  event_name: CanonicalEventName;
  event_id: string;
  email?: string;
  phone?: string;
  name?: string;
  product?: string;
  source_url: string;
  fbp?: string | null;
  fbc?: string | null;
  ga_client_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  fbclid?: string;
  gclid?: string;
  value?: number;
  currency?: string;
  category?: string;
  coupon?: string;
  quantity?: number;
}

// Cloudflare Pages Functions: este arquivo em functions/api/collect.ts vira
// a rota /api/collect. onRequestPost só responde a POST; onRequestOptions
// cobre o preflight de CORS.
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  let payload: CollectPayload;
  try {
    payload = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS_HEADERS });
  }

  if (!payload.event_name || !payload.event_id) {
    return new Response('Missing event_name or event_id', {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const clientIp = request.headers.get('cf-connecting-ip') ?? '';
  const userAgent = request.headers.get('user-agent') ?? '';

  // 1. Grava/atualiza o lead no Supabase (CRM)
  let leadId: string | null = null;
  if (payload.email) {
    const supabase = getSupabase(env);
    const { data: leadRow, error: leadError } = await supabase
      .from('leads')
      .upsert(
        {
          email: payload.email,
          phone: payload.phone,
          name: payload.name,
          product: payload.product,
          utm_source: payload.utm_source,
          utm_medium: payload.utm_medium,
          utm_campaign: payload.utm_campaign,
          utm_term: payload.utm_term,
          utm_content: payload.utm_content,
          fbclid: payload.fbclid,
          gclid: payload.gclid,
          fbp: payload.fbp,
          fbc: payload.fbc,
          ga_client_id: payload.ga_client_id,
          source_url: payload.source_url,
          last_event_name: payload.event_name,
        },
        { onConflict: 'email' }
      )
      .select('id')
      .single();

    if (leadError) {
      console.error('Erro ao gravar lead no Supabase:', leadError.message);
    } else {
      leadId = leadRow?.id ?? null;
    }
  }

  // 2. Normaliza e despacha pelo mesmo pipeline central (formatação por
  //    plataforma + dedup) usado pelo webhook da Hotmart
  const [firstName, ...restName] = (payload.name ?? '').split(' ').filter(Boolean);
  const lastName = restName.join(' ');

  const normalized: NormalizedEvent = {
    eventId: payload.event_id,
    canonicalName: payload.event_name,
    eventTime: Math.floor(Date.now() / 1000),
    sourceUrl: payload.source_url,
    actionSource: 'website',
    user: {
      email: payload.email,
      phone: payload.phone,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      internalId: leadId ?? undefined,
      clientIp,
      userAgent,
      fbp: payload.fbp,
      fbc: payload.fbc,
      gaClientId: payload.ga_client_id,
    },
    commerce:
      payload.value !== undefined || payload.product
        ? {
            value: payload.value,
            currency: payload.currency ?? 'BRL',
            productName: payload.product,
            contentCategory: payload.category,
            coupon: payload.coupon,
            quantity: payload.quantity,
          }
        : undefined,
    raw: payload,
  };

  const result = await dispatchEvent(normalized, env, leadId);

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
};
