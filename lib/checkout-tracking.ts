import { getSupabase } from './supabase';
import type { Env } from './env';

export interface CheckoutTrackingContext {
	code: string;
	fbp?: string | null;
	fbc?: string | null;
	gaClientId?: string | null;
	externalId?: string | null;
	clientIp?: string;
	userAgent?: string;
	utmSource?: string | null;
	utmMedium?: string | null;
	utmCampaign?: string | null;
	utmTerm?: string | null;
	utmContent?: string | null;
}

// Chamado em functions/api/checkout-redirect.ts, no momento em que o
// visitante clica em "Comprar" e é redirecionado para o checkout da Hotmart.
export async function saveCheckoutTracking( ctx: CheckoutTrackingContext, env: Env ) {
	const supabase = getSupabase( env );
	await supabase.from( 'checkout_tracking' ).insert( {
		code: ctx.code,
		fbp: ctx.fbp,
		fbc: ctx.fbc,
		ga_client_id: ctx.gaClientId,
		external_id: ctx.externalId,
		client_ip: ctx.clientIp,
		user_agent: ctx.userAgent,
		utm_source: ctx.utmSource,
		utm_medium: ctx.utmMedium,
		utm_campaign: ctx.utmCampaign,
		utm_term: ctx.utmTerm,
		utm_content: ctx.utmContent,
	} );
}
// Chamado em functions/api/webhooks/hotmart.ts para recuperar o contexto
// pelo código que voltou no payload do webhook (ver lib/hotmart.ts:extractTrackingCode)
export async function getCheckoutTracking( code: string, env: Env ) {
	const supabase = getSupabase( env );
	const { data } = await supabase
		.from( 'checkout_tracking' )
		.select( '*' )
		.eq( 'code', code )
		.maybeSingle();
	return data;
}
