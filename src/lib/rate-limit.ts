/**
 * Simple rate limiter para server actions
 * Usa in-memory store con TTL (time-to-live)
 * En producción, usar Redis es recomendado
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * In-memory store para rate limiting
 * En producción, migrar a Redis
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Limpiar entradas expiradas periódicamente
 */
const CLEANUP_INTERVAL = 60 * 1000; // 1 minuto
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Opciones para rate limiting
 */
export interface RateLimitOptions {
  /** Máximo de requests permitidos */
  limit: number;
  /** Ventana de tiempo en segundos */
  window: number;
  /** Claves a usar para identificar el cliente (ej: ['userId', 'ip']) */
  keys?: string[];
}

/**
 * Información extraída de la request para rate limiting
 */
export interface RateLimitContext {
  userId?: string;
  ip?: string;
  [key: string]: any;
}

/**
 * Valida si un cliente ha excedido el rate limit
 * Lanza error si límite es excedido
 * 
 * @example
 * ```ts
 * checkRateLimit({
 *   userId: req.uid,
 *   ip: getClientIp(req)
 * }, {
 *   limit: 10,
 *   window: 60,
 *   keys: ['userId', 'ip']
 * });
 * ```
 */
export function checkRateLimit(context: RateLimitContext, options: RateLimitOptions): boolean {
  const { limit, window, keys = ['userId'] } = options;
  
  // Generar clave única para este cliente
  const keyParts = keys
    .filter(k => context[k] !== undefined)
    .map(k => `${k}:${context[k]}`);
  
  if (keyParts.length === 0) {
    console.warn('[RateLimit] No keys matched in context, using IP fallback');
    keyParts.push(`ip:${context.ip || 'unknown'}`);
  }

  const key = keyParts.join(':');
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry) {
    // Primera request en esta ventana
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + window * 1000,
    });
    return true;
  }

  // Ventana expirada, resetear contador
  if (entry.resetTime < now) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + window * 1000,
    });
    return true;
  }

  // Incrementar contador
  entry.count++;

  // Verificar si se excedió el límite
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    throw new Error(
      `Rate limit exceeded (${entry.count}/${limit} requests in ${window}s). ` +
      `Retry after ${retryAfter} seconds.`
    );
  }

  return true;
}

/**
 * Wrapper para server actions que require rate limiting
 * @example
 * ```ts
 * export const saveFamilyMember = withRateLimit(
 *   async (idToken, memberId, memberData) => { ... },
 *   { limit: 10, window: 60 }
 * );
 * ```
 */
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RateLimitOptions,
  getContext?: (args: any[]) => RateLimitContext,
): T {
  return (async (...args: any[]) => {
    try {
      // Extraer contexto (por defecto: primer arg es idToken con UID incluido)
      let context: RateLimitContext = {};
      
      if (getContext) {
        context = getContext(args);
      } else {
        // Fallback: intentar extraer de primer argumento si es idToken
        const idToken = args[0];
        if (typeof idToken === 'string' && idToken.includes('.')) {
          try {
            // Decodificar JWT manualmente si es posible
            const parts = idToken.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
              context.userId = payload.uid || payload.sub;
            }
          } catch {
            // Ignorar si no se puede decodificar
          }
        }
      }

      // Validar rate limit
      checkRateLimit(context, options);

      // Ejecutar función original
      return await fn(...args);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Rate limit exceeded')) {
        console.warn('[RateLimit] Request limited:', error.message);
        throw error;
      }
      throw error;
    }
  }) as T;
}

/**
 * Get client IP from request headers
 * Útil para identificar clientes
 */
export function getClientIp(headers: Record<string, string | undefined>): string {
  return (
    headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    headers['x-real-ip'] ||
    headers['cf-connecting-ip'] ||
    'unknown'
  );
}

/**
 * Obtener estadísticas de rate limiting (para debugging)
 */
export function getRateLimitStats() {
  const stats: Record<string, any> = {};
  for (const [key, entry] of rateLimitStore.entries()) {
    stats[key] = {
      count: entry.count,
      resetIn: Math.ceil((entry.resetTime - Date.now()) / 1000) + 's',
    };
  }
  return stats;
}
