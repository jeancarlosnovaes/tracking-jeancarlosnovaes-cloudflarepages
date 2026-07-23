import { getSupabase } from './supabase';
import { buildMetaEvent } from './format-meta';
import { buildGa4Event } from './format-ga4';
import { postMetaEvents } from './meta-capi';
import { postGa4Event } from './ga4';
import type { NormalizedEvent } from './normalized-event';
import type { Env } from './env';

// Ponto único por onde todo evento passa, venha do site (functions/api/collect)
// ou da Hotmart (functions/api/webhooks/hotmart). Faz três coisas:
// 1. Deduplicação: se este event_id já foi processado, não reenvia nada —
//    protege contra retries (a Hotmart reenvia webhook até 5x em caso de
//    erro/timeout, e isso não pode virar 5 "Purchase" duplicadas no Meta).
// 2. Dispara em paralelo para Meta CAPI e GA4, cada um já formatado no
//    schema recomendado da respectiva plataforma.
// 3. Loga o resultado do disparo na tabela events, pra auditoria/debug.
export async function dispatchEvent(
	evt: NormalizedEvent,
	env: Env,
	leadId: string | null = null
) {
	const supabase = getSupabase( env );

	const { data: existing } = await supabase
		.from( 'events' )
		.select( 'id' )
		.eq( 'event_id', evt.eventId )
		.maybeSingle();

	if ( existing ) {
		return { skipped: true, reason: 'already_processed' as const };
	}

	const metaEvent = await buildMetaEvent( evt, env );
	const ga4Event = await buildGa4Event( evt, env );

	const [ metaResult, ga4Result ] = await Promise.allSettled( [
		metaEvent ? postMetaEvents( [ metaEvent ], env ) : Promise.resolve( { skipped: true } ),
		ga4Event ? postGa4Event( ga4Event, env ) : Promise.resolve( { skipped: true } ),
	] );

	const debugEnabled = env.DEBUG_LOG?.toLowerCase() === 'true' || env.DEBUG_LOG === '1';

	const metaResultValue = metaResult.status === 'fulfilled' ? metaResult.value : { error: String( metaResult.reason ) };
	const ga4ResultValue = ga4Result.status === 'fulfilled' ? ga4Result.value : { error: String( ga4Result.reason ) };

	if ( debugEnabled ) {
		const debugPayload = {
			event_name: evt.canonicalName,
			event_id: evt.eventId,
			meta_request: metaEvent,
			meta_result: metaResultValue,
			ga4_request: ga4Event,
			ga4_result: ga4ResultValue,
		};
		// Log do lado do servidor — só visível via `wrangler tail` ou dashboard
		console.log( `[dispatchEvent] ${evt.canonicalName} (${evt.eventId})`, JSON.stringify( debugPayload, null, 2 ) );

		await supabase.from( 'events' ).insert( {
			event_id: evt.eventId,
			event_name: evt.canonicalName,
			lead_id: leadId,
			meta_request: metaEvent,
			meta_status: metaResult.status,
			meta_response: metaResultValue,
			ga4_request: ga4Event,
			ga4_status: ga4Result.status,
			ga4_response: ga4ResultValue,
			raw_payload: evt.raw ?? evt,
		} );

		// Devolvido na resposta HTTP pra quem chamou (ex: track.js) poder
		// imprimir no console DO NAVEGADOR — é isso que aparece lá.
		return { skipped: false as const, debug: debugPayload };
	}

	await supabase.from( 'events' ).insert( {
		event_id: evt.eventId,
		event_name: evt.canonicalName,
		lead_id: leadId,
		meta_status: metaResult.status,
		meta_response: metaResultValue,
		ga4_status: ga4Result.status,
		ga4_response: ga4ResultValue,
		raw_payload: evt.raw ?? evt,
	} );

	return { skipped: false as const };
}
