import { createClient } from "@supabase/supabase-js";

/**
 * ⚠️ ATENÇÃO: getSupabaseAdmin() usa SERVICE_ROLE_KEY e IGNORA TODAS AS RLS.
 *
 * Usar SOMENTE para leituras públicas agregadas e operações de sistema sem
 * utilizador associado. Para mutações de utilizador autenticado, preferir
 * getSupabaseUserScoped() para manter RLS como defesa em profundidade.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
