( function () {
	// Descobre a origem de onde ESTE script foi carregado (ex:
	// https://fbapi.jeancarlosnovaes.com), pra montar a URL absoluta do
	// endpoint. Necessário porque o track.js roda embutido no site principal
	// (jeancarlosnovaes.com), que pode ser um domínio diferente do domínio
	// onde a API está hospedada — um caminho relativo tipo '/api/collect'
	// resolveria pro domínio ERRADO (o da página, não o do script).
	var scriptOrigin = ( function () {
		var current = document.currentScript;
		if ( current && current.src ) {
			try {
				return new URL( current.src ).origin;
			} catch ( e ) {
				/* ignora e cai no fallback abaixo */
			}
		}
		return window.location.origin;
	} )();
	var COLLECT_ENDPOINT = scriptOrigin + '/api/collect';

	function getCookie( name ) {
		const match = document.cookie.match( new RegExp( '(^| )' + name + '=([^;]+)' ) );
		return match ? decodeURIComponent( match[ 2 ] ) : null;
	}

	function getParam( name ) {
		return new URLSearchParams( window.location.search ).get( name );
	}

	// Extrai o client_id "real" do cookie _ga (formato GA1.2.XXXXXXXXX.YYYYYYYYYY)
	function getGaClientId() {
		const raw = getCookie( '_ga' );
		if ( !raw ) return null;
		const parts = raw.split( '.' );
		return parts.length >= 4 ? parts.slice( -2 ).join( '.' ) : null;
	}

	// ID anônimo persistente (localStorage sobrevive entre visitas, ao
	// contrário de um cookie de sessão). Vai em TODO evento como external_id
	// — é o que dá continuidade entre PageView/Lead/InitiateCheckout e a
	// Purchase que só chega bem depois pelo webhook da Hotmart, permitindo à
	// Meta casar toda a jornada como a mesma pessoa (melhora o Event Match
	// Quality mais do que só o ID da transação isolado).
	function getOrCreateExternalId() {
		var stored = localStorage.getItem( '_ext_id' );
		if ( stored ) return stored;
		var id = crypto.randomUUID();
		localStorage.setItem( '_ext_id', id );
		return id;
	}
	var externalId = getOrCreateExternalId();

	// Persiste UTMs e clickids no primeiro acesso, mesmo que o usuário
	// navegue por várias páginas antes de converter
	const stored = JSON.parse( localStorage.getItem( '_track_ctx' ) || '{}' );
	const ctx = {
		utm_source: getParam( 'utm_source' ) || stored.utm_source || null,
		utm_medium: getParam( 'utm_medium' ) || stored.utm_medium || null,
		utm_campaign: getParam( 'utm_campaign' ) || stored.utm_campaign || null,
		utm_term: getParam( 'utm_term' ) || stored.utm_term || null,
		utm_content: getParam( 'utm_content' ) || stored.utm_content || null,
		fbclid: getParam( 'fbclid' ) || stored.fbclid || null,
		gclid: getParam( 'gclid' ) || stored.gclid || null,
	};
	localStorage.setItem( '_track_ctx', JSON.stringify( ctx ) );

	// API pública: chame em qualquer lugar do site
	// trackEvent('Purchase', { email, phone, name, product, value: 197, currency: 'BRL' })
	//
	// Campos aceitos em `data` (todos opcionais, use o que fizer sentido pro evento):
	//   email, phone, name        -> viram user_data hasheado (Meta) / user_data (GA4)
	//   product                   -> content_name (Meta) / item_name (GA4)
	//   value, currency           -> value/currency nos dois
	//   category                  -> content_category (Meta) / item_category (GA4)
	//   coupon                    -> coupon (só GA4 — a Meta não tem esse parâmetro)
	//   quantity                  -> num_items/contents[].quantity (Meta) / items[].quantity (GA4)
	window.trackEvent = function ( eventName, data ) {
		data = data || {};
		const payload = Object.assign(
			{
				event_name: eventName,
				event_id: crypto.randomUUID(),
				source_url: window.location.href,
				fbp: getCookie( '_fbp' ),
				fbc: getCookie( '_fbc' ),
				ga_client_id: getGaClientId(),
				external_id: externalId,
			},
			ctx,
			data.email ? { email: data.email } : {},
			data.phone ? { phone: data.phone } : {},
			data.name ? { name: data.name } : {},
			data.product ? { product: data.product } : {},
			data.value !== undefined ? { value: data.value } : {},
			data.currency ? { currency: data.currency } : {},
			data.category ? { category: data.category } : {},
			data.coupon ? { coupon: data.coupon } : {},
			data.quantity !== undefined ? { quantity: data.quantity } : {}
		);

		const body = JSON.stringify( payload );
		// sendBeacon é "fire and forget" — não dá pra ler a resposta, então não
		// dava pra mostrar o debug no console. Com DEBUG_LOG=true no servidor,
		// a resposta traz o payload exato enviado pra Meta/GA4 e aparece aqui.
		fetch( COLLECT_ENDPOINT, { method: 'POST', body, keepalive: true } )
			.then( function ( res ) {
				return res.json();
			} )
			.then( function ( data ) {
				if ( data && data.debug ) {
					console.log( '[tracking] ' + eventName, data.debug );
				}
			} )
			.catch( function () {
				/* nunca quebra a página por causa de tracking */
			} );
	};

	// Dispara PageView automático a cada carregamento
	window.trackEvent( 'PageView' );

	// Dispara ViewContent também automaticamente. "product" aqui vira
	// content_name (Meta) / item_name (GA4) — por padrão usa o <title> da
	// página. Numa página de produto específica, prefira chamar de novo com
	// o nome certo: trackEvent('ViewContent', { product: 'Nome do Produto' })
	window.trackEvent( 'ViewContent', { product: document.title } );

	// Monta o link do botão "Comprar". Use assim no site:
	//   <a href="#" onclick="window.location.href = buildCheckoutUrl('https://pay.hotmart.com/XXXX'); return false;">Comprar</a>
	//
	// Por que não usar um href estático direto pro /api/checkout-redirect? Porque
	// fbp/fbc são cookies do domínio do SITE (jeancarlosnovaes.com) — numa
	// navegação normal pro domínio da API (fbapi.jeancarlosnovaes.com), o
	// navegador NÃO manda cookies de um domínio pro outro. Lendo aqui (mesma
	// origem da página) e mandando como query param, contorna isso.
	window.buildCheckoutUrl = function ( hotmartCheckoutUrl ) {
		const params = new URLSearchParams( { url: hotmartCheckoutUrl } );
		params.set( 'fbp', getCookie( '_fbp' ) || '' );
		params.set( 'fbc', getCookie( '_fbc' ) || '' );
		params.set( 'ga_client_id', getGaClientId() || '' );
		params.set( 'external_id', externalId );
		Object.keys( ctx ).forEach( function ( key ) {
			if ( ctx[ key ] ) params.set( key, ctx[ key ] );
		} );
		return COLLECT_ENDPOINT.replace( '/api/collect', '/api/checkout-redirect' ) + '?' + params.toString();
	};
} )();
