import type { PagesFunction } from '@cloudflare/workers-types';
import { saveCheckoutTracking } from '../../lib/checkout-tracking';
import type { Env } from '../../lib/env';

// Troque o link "Comprar" do seu site de:
//   https://pay.hotmart.com/XXXXXXXX
// para:
//   https://fbapi.seudominio.com/api/checkout-redirect?url=https://pay.hotmart.com/XXXXXXXX
//
// Isso grava fbp/fbc/ga_client_id/UTMs num registro com um código único,
// anexa esse código como ?sck= no link da Hotmart, e redireciona. Quando o
// webhook da compra chegar, esse mesmo código volta no payload e permite
// recuperar o contexto do clique (ver lib/hotmart.ts:extractTrackingCode).
export const onRequestGet: PagesFunction<Env> = async ( context ) => {
	const { request, env } = context;
	const url = new URL( request.url );
	const checkoutUrl = url.searchParams.get( 'url' );
	if ( !checkoutUrl ) {
		return new Response( 'Missing url param', { status: 400 } );
	}

	const code = crypto.randomUUID();

	const cookieHeader = request.headers.get( 'cookie' ) ?? '';
	const getCookie = ( name: string ) => {
		const match = cookieHeader.match( new RegExp( '(^|; )' + name + '=([^;]+)' ) );
		return match ? decodeURIComponent( match[ 2 ] ) : null;
	};
	const getGaClientIdFromCookie = () => {
		const raw = getCookie( '_ga' );
		if ( !raw ) return null;
		const parts = raw.split( '.' );
		return parts.length >= 4 ? parts.slice( -2 ).join( '.' ) : null;
	};
	// Essa requisição é uma navegação de verdade do visitante (clicou em
	// "Comprar"), então o cf aqui reflete a localização de quem está
	// comprando — é o melhor momento pra capturar isso pra usar na Purchase.
	const cf = ( request as any ).cf as
		| { city?: string; region?: string; postalCode?: string; country?: string; }
		| undefined;

	// Prioriza os query params — é o que o track.js manda via buildCheckoutUrl(),
	// lendo os cookies no navegador (mesma origem do site). O fallback pra
	// cookie só serve pro caso raro de site e API estarem no MESMO domínio;
	// em domínios separados (ex: fbapi.jeancarlosnovaes.com vs
	// jeancarlosnovaes.com), o cookie do site nunca chega aqui de qualquer forma.
	await saveCheckoutTracking(
		{
			code,
			fbp: url.searchParams.get( 'fbp' ) || getCookie( '_fbp' ),
			fbc: url.searchParams.get( 'fbc' ) || getCookie( '_fbc' ),
			gaClientId: url.searchParams.get( 'ga_client_id' ) || getGaClientIdFromCookie(),
			externalId: url.searchParams.get( 'external_id' ),
			clientIp: request.headers.get( 'cf-connecting-ip' ) ?? undefined,
			userAgent: request.headers.get( 'user-agent' ) ?? undefined,
			utmSource: url.searchParams.get( 'utm_source' ),
			utmMedium: url.searchParams.get( 'utm_medium' ),
			utmCampaign: url.searchParams.get( 'utm_campaign' ),
			utmTerm: url.searchParams.get( 'utm_term' ),
			utmContent: url.searchParams.get( 'utm_content' ),
			city: cf?.city,
			state: cf?.region,
			zip: cf?.postalCode,
			countryIso: cf?.country,
		},
		env
	);

	let destination: URL;
	try {
		destination = new URL( checkoutUrl );
	} catch {
		return new Response( 'Invalid url param', { status: 400 } );
	}
	destination.searchParams.set( 'sck', code );

	return Response.redirect( destination.toString(), 302 );
};
