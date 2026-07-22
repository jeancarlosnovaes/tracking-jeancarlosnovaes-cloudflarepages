import { createClient } from '@supabase/supabase-js';
import type { Env } from './env';

// No Cloudflare Pages Functions, env só existe dentro do handler
// (context.env) — por isso o cliente é criado sob demanda a partir do env
// de cada requisição, em vez de um singleton no topo do módulo. Criar o
// client é uma operação barata (não abre conexão de fato até o primeiro
// fetch), então não há problema de performance em criar um por requisição.
export function getSupabase( env: Env ) {
	return createClient( env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false },
	} );
}
