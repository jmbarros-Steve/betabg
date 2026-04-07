/**
 * Helpers para queries Supabase con error handling obligatorio.
 *
 * Responden al patrón bug sistémico detectado en el audit de deuda técnica
 * (docs/audits/supabase-error-capture-2026-04-07.md): 457 destructurings
 * que NO capturaban `error` → silent failures → bugs invisibles.
 *
 * Estrategia: 3 helpers para diferentes niveles de criticidad.
 *
 * ## Cuándo usar cuál
 *
 * - `safeQuery`: fail-fast. Para queries críticas donde fallar es mejor
 *   que degradar silenciosamente. Típicamente en crons del Brain y
 *   operaciones que no deben proceder sin los datos. Throws Error.
 *
 * - `safeQuerySingle`: igual que safeQuery pero para `.single()` o
 *   `.maybeSingle()`. Retorna T | null. Si es maybeSingle y no hay row,
 *   retorna null sin throw. Si es single y hay error real, throws.
 *
 * - `safeQueryOrDefault`: graceful degradation. Para queries donde el
 *   caller puede continuar con un default (array vacío típicamente).
 *   Loguea el error pero NO throws. Retorna defaultValue si falla.
 *
 * ## Ejemplo: fail-fast en cron crítico
 *
 * ```typescript
 * import { safeQuery } from '../../lib/safe-supabase.js';
 *
 * export async function myAuditCron(c: Context) {
 *   const supabase = getSupabaseAdmin();
 *
 *   // Antes:
 *   // const { data: users } = await supabase.from('users').select('*');
 *   // if (users.length === 0) ... // users puede ser null silenciosamente
 *
 *   // Ahora:
 *   const users = await safeQuery(
 *     supabase.from('users').select('*'),
 *     'myAuditCron.users',
 *   );
 *   // users es T[] garantizado, o ya hicimos throw.
 * }
 * ```
 *
 * ## Ejemplo: graceful degradation en ruta con UX frente al cliente
 *
 * ```typescript
 * import { safeQueryOrDefault } from '../../lib/safe-supabase.js';
 *
 * const campaigns = await safeQueryOrDefault(
 *   supabase.from('campaigns').select('*').eq('client_id', clientId),
 *   [],  // default: empty array
 *   'listCampaigns',
 * );
 * // campaigns es [] si falla, con log para debug
 * ```
 *
 * ## Ejemplo: single row con maybeSingle
 *
 * ```typescript
 * import { safeQuerySingle } from '../../lib/safe-supabase.js';
 *
 * const user = await safeQuerySingle(
 *   supabase.from('users').select('*').eq('id', userId).maybeSingle(),
 *   'getUserById',
 * );
 * if (!user) return c.json({ error: 'not_found' }, 404);
 * // user es T garantizado (non-null)
 * ```
 *
 * ## Migración gradual
 *
 * Estos helpers son opt-in. El código existente sigue funcionando.
 * Cada agente puede migrar sus archivos cuando arregle casos del audit
 * (ver docs/audits/supabase-error-capture-2026-04-07.md tasks #31-#37).
 *
 * Cuando un archivo migra 100% a safe-supabase, el audit automáticamente
 * lo marca como resuelto porque el patrón `await supabase.from(...)` sin
 * capturar error ya no existe.
 */

import type { PostgrestResponse, PostgrestSingleResponse, PostgrestError } from '@supabase/supabase-js';

/**
 * Error lanzado cuando una query de Supabase falla en `safeQuery` /
 * `safeQuerySingle`. Preserva el error original de PostgREST en `cause`.
 */
export class SupabaseQueryError extends Error {
  public readonly context: string;
  public readonly originalError: PostgrestError;

  constructor(context: string, originalError: PostgrestError) {
    super(`[${context}] supabase query failed: ${originalError.message}`);
    this.name = 'SupabaseQueryError';
    this.context = context;
    this.originalError = originalError;
  }
}

/**
 * Await una query Supabase que retorna múltiples rows. Throws
 * `SupabaseQueryError` si falla. Retorna `data || []` si OK.
 *
 * @param promise - Query builder de Supabase. Normalmente `supabase.from('x').select(...)`.
 * @param context - String para identificar la query en logs/errores (ej: `'myCron.fetchUsers'`).
 * @returns Array de filas (nunca null).
 */
export async function safeQuery<T>(
  promise: PromiseLike<PostgrestResponse<T>>,
  context: string,
): Promise<T[]> {
  const { data, error } = await promise;
  if (error) {
    throw new SupabaseQueryError(context, error);
  }
  return data || [];
}

/**
 * Await una query Supabase con `.single()` o `.maybeSingle()`. Throws
 * `SupabaseQueryError` para errores reales. Retorna `null` si es
 * `.maybeSingle()` y no hay row (PostgREST error code PGRST116).
 *
 * @param promise - Query builder con `.single()` o `.maybeSingle()`.
 * @param context - String para identificar la query en logs/errores.
 * @returns Fila única o null (solo si maybeSingle sin match).
 */
export async function safeQuerySingle<T>(
  promise: PromiseLike<PostgrestSingleResponse<T>>,
  context: string,
): Promise<T | null> {
  const { data, error } = await promise;
  if (error) {
    // PGRST116: "JSON object requested, multiple (or no) rows returned"
    // Solo ocurre con .maybeSingle() cuando no hay rows → retornar null.
    if (error.code === 'PGRST116') return null;
    throw new SupabaseQueryError(context, error);
  }
  return data;
}

/**
 * Await una query Supabase con degradación graceful. NO throws. Si falla,
 * loguea en console.error y retorna `defaultValue`. Usar para rutas con
 * UX frente al usuario donde el caller puede continuar con defaults.
 *
 * @param promise - Query builder de Supabase.
 * @param defaultValue - Valor a retornar si la query falla o `data` es null.
 * @param context - String para identificar la query en logs.
 * @returns `data` si OK, `defaultValue` si falla.
 */
export async function safeQueryOrDefault<T>(
  promise: PromiseLike<PostgrestResponse<T>>,
  defaultValue: T[],
  context: string,
): Promise<T[]> {
  const { data, error } = await promise;
  if (error) {
    console.error(`[${context}] supabase query failed (degraded):`, error.message);
    return defaultValue;
  }
  return data || defaultValue;
}

/**
 * Variante de `safeQueryOrDefault` para queries single-row. Retorna
 * `defaultValue` (típicamente null) si falla. NO throws.
 */
export async function safeQuerySingleOrDefault<T>(
  promise: PromiseLike<PostgrestSingleResponse<T>>,
  defaultValue: T | null,
  context: string,
): Promise<T | null> {
  const { data, error } = await promise;
  if (error) {
    if (error.code === 'PGRST116') return defaultValue;
    console.error(`[${context}] supabase single query failed (degraded):`, error.message);
    return defaultValue;
  }
  return data ?? defaultValue;
}
