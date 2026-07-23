// No Vercel Edge, qualquer arquivo lê process.env diretamente. No Cloudflare
// Pages Functions não existe esse global — as variáveis/segredos chegam por
// requisição, em context.env, dentro do handler (onRequestPost etc). Por
// isso todo lib/* que precisa de uma variável agora recebe `env: Env` como
// parâmetro, em vez de ler de um global.
export interface Env {
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
	META_PIXEL_ID: string;
	META_ACCESS_TOKEN: string;
	META_TEST_EVENT_CODE?: string;
	GA4_MEASUREMENT_ID: string;
	GA4_API_SECRET: string;
	// "true" troca o endpoint de produção pelo de validação (/debug/mp/collect)
	// — o evento NÃO é registrado no GA4, mas a resposta traz os erros
	// exatos do payload em validationMessages. Deixe sem definir em produção.
	GA4_DEBUG?: string;
	HOTMART_HOTTOK: string;
	// "true" imprime no console o JSON exato enviado e a resposta de cada
	// plataforma, pra debug local (wrangler dev) ou via `wrangler tail` em produção
	DEBUG_LOG?: string;
	DEFAULT_PHONE_COUNTRY_CODE?: string;
}
