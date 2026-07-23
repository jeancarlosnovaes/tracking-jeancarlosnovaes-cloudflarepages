import type { Env } from './env';

export interface Ga4Address {
	sha256_first_name?: string;
	sha256_last_name?: string;
	sha256_street?: string;
	city?: string;
	region?: string;
	postal_code?: string;
	country?: string;
}

export interface Ga4UserData {
	sha256_email_address?: string;
	sha256_phone_number?: string;
	address?: Ga4Address;
}

export interface Ga4Payload {
	client_id: string;
	user_id?: string;
	user_data?: Ga4UserData;
	events: Array<{ name: string; params: Record<string, unknown>; }>;
}

// Só envia — a formatação fica em lib/format-ga4.ts
export async function postGa4Event( payload: Ga4Payload, env: Env ) {
	// Endpoint de produção responde 204 sem corpo — não dá pra saber se o
	// payload tinha algum erro de formatação. O de validação NÃO registra o
	// evento de verdade, mas devolve validationMessages com o problema exato.
	const base = env.GA4_DEBUG === 'true' ? 'debug/mp/collect' : 'mp/collect';

	const res = await fetch(
		`https://www.google-analytics.com/${base}?measurement_id=${env.GA4_MEASUREMENT_ID}&api_secret=${env.GA4_API_SECRET}`,
		{
			method: 'POST',
			body: JSON.stringify( payload ),
		}
	);

	const body = env.GA4_DEBUG === 'true' ? await res.json().catch( () => null ) : null;
	return { ok: res.ok, status: res.status, ...( body ? { validation: body } : {} ) };
}
