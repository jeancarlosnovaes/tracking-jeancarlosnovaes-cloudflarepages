// Normalização de PII exigida por cada plataforma antes do SHA-256.
// Meta e GA4 pedem coisas parecidas mas NÃO idênticas — misturar as duas
// normalizações faz o hash não bater com o que a plataforma espera, e o
// evento simplesmente não casa com o usuário (fica como conversão "cega").
//
// Meta: https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters
//   em: remove TODOS os espaços (não só das pontas) + minúsculas
//   ph: só dígitos, com código do país, SEM zeros à esquerda, sem "+"
//   fn/ln: minúsculas, sem pontuação, mas MANTÉM acentos/não-latinos
//          (o próprio exemplo da Meta normaliza "Valéry" -> "valéry")
//   ct/st/zp/country: minúsculas, sem pontuação
//   zp: nos EUA, só os 5 primeiros dígitos
// GA4: https://developers.google.com/analytics/devguides/collection/ga4/uid-data
//   email: minúsculas + remove espaços + remove pontos antes de @ em
//          gmail.com/googlemail.com
//   phone: só dígitos + prefixo "+" (padrão E.164)
//   address.first_name/last_name/street: remove dígitos/símbolos + minúsculas + trim
//   address.city/region: mesma coisa, mas NÃO são hasheados
//   address.postal_code: só remove "." e "~" — NÃO é hasheado, sem lowercase
//   address.country: ISO alpha-2 como veio — NÃO é hasheado

function digitsOnly( phone: string ): string {
	return phone.replace( /\D/g, '' );
}

// Garante o código do país na frente do número. Números BR digitados sem
// o "55" costumam ter 10 dígitos (fixo, DDD+8) ou 11 (celular, DDD+9+8) —
// nesses casos prefixamos o código padrão. Se o número já vier mais longo
// (>= 12 dígitos) e já começar com o código, não mexe.
function ensureCountryCode( digits: string, defaultCountryCode: string ): string {
	const noLeadingZeros = digits.replace( /^0+/, '' );
	if ( noLeadingZeros.startsWith( defaultCountryCode ) && noLeadingZeros.length > 11 ) {
		return noLeadingZeros;
	}
	if ( noLeadingZeros.length <= 11 ) {
		return `${defaultCountryCode}${noLeadingZeros}`;
	}
	return noLeadingZeros;
}

// ---------- Meta ----------
// https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters

// "Remova os espaços em branco. Converta todos os caracteres para minúsculas."
export function normalizeEmailForMeta( email: string ): string {
	return email.replace( /\s+/g, '' ).toLowerCase();
}

// Só dígitos, com código do país, sem zeros à esquerda, sem símbolos
export function normalizePhoneForMeta( phone: string, defaultCountryCode: string ): string {
	return ensureCountryCode( digitsOnly( phone ), defaultCountryCode );
}

// "Apenas minúsculas, sem pontuação." — mantém acentos e caracteres não
// romanos (o próprio exemplo da Meta preserva "Valéry" → "valéry"; só a
// pontuação é removida, não o alfabeto usado).
export function normalizeNameForMeta( name: string ): string {
	return name
		.toLowerCase()
		.replace( /[^\p{L}\p{N}\s]/gu, '' )
		.trim();
}

// Cidade: minúsculas, sem pontuação/espaços especiais
export function normalizeCityForMeta( city: string ): string {
	return city
		.toLowerCase()
		.replace( /[^\p{L}]/gu, '' )
		.trim();
}

// Estado: sigla de 2 letras em minúsculas (ANSI para EUA; para outros
// países, a Meta pede só minúsculas sem pontuação/espaço)
export function normalizeStateForMeta( state: string ): string {
	return state
		.toLowerCase()
		.replace( /[^\p{L}]/gu, '' )
		.trim();
}

// CEP: minúsculas, sem espaço/traço. Nos EUA, só os 5 primeiros dígitos.
export function normalizeZipForMeta( zip: string, countryIso?: string ): string {
	const cleaned = zip.toLowerCase().replace( /[\s-]/g, '' );
	if ( countryIso?.toLowerCase() === 'us' ) return cleaned.slice( 0, 5 );
	return cleaned;
}

// País: código ISO 3166-1 alpha-2 em minúsculas
export function normalizeCountryForMeta( countryIso: string ): string {
	return countryIso.trim().toLowerCase();
}

// ---------- GA4 ----------

export function normalizeEmailForGa4( email: string ): string {
	const lower = email.trim().toLowerCase().replace( /\s+/g, '' );
	const atIndex = lower.lastIndexOf( '@' );
	if ( atIndex === -1 ) return lower;
	const local = lower.slice( 0, atIndex );
	const domain = lower.slice( atIndex + 1 );
	if ( domain === 'gmail.com' || domain === 'googlemail.com' ) {
		return `${local.replace( /\./g, '' )}@${domain}`;
	}
	return lower;
}

// E.164: só dígitos com "+" na frente
export function normalizePhoneForGa4( phone: string, defaultCountryCode: string ): string {
	return `+${ensureCountryCode( digitsOnly( phone ), defaultCountryCode )}`;
}

// GA4 pede explicitamente remoção de dígitos e símbolos do nome, diferente da Meta
export function normalizeNameForGa4( name: string ): string {
	return name
		.trim()
		.toLowerCase()
		.replace( /[0-9]/g, '' )
		.replace( /[^\p{L}\s]/gu, '' )
		.trim();
}

// user_data.address[].sha256_street: remove símbolos (mantém dígitos do
// número da casa), minúsculas, trim
export function normalizeStreetForGa4( street: string ): string {
	return street
		.trim()
		.toLowerCase()
		.replace( /[^\p{L}\p{N}\s]/gu, '' )
		.trim();
}

// user_data.address[].city / region: remove dígitos e símbolos, minúsculas,
// trim — NÃO é hasheado, vai em texto puro no payload
export function normalizeCityForGa4( city: string ): string {
	return city
		.trim()
		.toLowerCase()
		.replace( /[0-9]/g, '' )
		.replace( /[^\p{L}\s]/gu, '' )
		.trim();
}

export function normalizeRegionForGa4( region: string ): string {
	return normalizeCityForGa4( region );
}

// user_data.address[].postal_code: remove "." e "~", trim — sem lowercase
// (o CEP do Reino Unido, por exemplo, tem letras) e NÃO é hasheado
export function normalizePostalCodeForGa4( zip: string ): string {
	return zip.replace( /[.~]/g, '' ).trim();
}

// user_data.address[].country: ISO 3166-1 alpha-2 — NÃO é hasheado, vai
// como veio (convenção do próprio doc do Google usa maiúsculas: "US")
export function normalizeCountryForGa4( countryIso: string ): string {
	return countryIso.trim().toUpperCase();
}
