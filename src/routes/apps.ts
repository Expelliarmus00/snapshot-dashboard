import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { APPS, type AppEntry } from '../apps.js';
import { config } from '../config.js';

// Cache des statuts de santé (évite de pinger les apps à chaque requête).
const healthCache = new Map<string, { status: 'ok' | 'down'; exp: number }>();
const HEALTH_TTL_MS = 30 * 1000;

/** Un utilisateur est propriétaire si aucun OWNER_EMAILS n'est défini, ou s'il y figure. */
function isOwner(request: FastifyRequest): boolean {
  const owners = config.OWNER_EMAILS;
  if (!owners.length) return true;
  const email = (request.user?.email || '').toLowerCase();
  return owners.includes(email);
}

/** Apps visibles pour cet utilisateur : les « privé » seulement pour les propriétaires. */
function visibleApps(request: FastifyRequest): AppEntry[] {
  const owner = isOwner(request);
  return APPS.filter((a) => a.category !== 'prive' || owner);
}

async function checkHealth(href: string): Promise<'ok' | 'down'> {
  const url = href.replace(/\/$/, '') + '/health';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return 'down';
    const j = (await res.json().catch(() => null)) as { status?: string } | null;
    return j && j.status === 'ok' ? 'ok' : 'down';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

/** Répertoire des apps exposé au portail (protégé). */
export const appsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/apps', async (request) => ({
    apps: visibleApps(request),
    isOwner: isOwner(request),
  }));

  // Statut de santé réel des apps visibles (ping /health, cache 30 s).
  app.get('/apps/health', async (request) => {
    const now = Date.now();
    const out: Record<string, 'ok' | 'down' | 'unknown'> = {};
    await Promise.all(
      visibleApps(request).map(async (a) => {
        if (a.status !== 'live' || !/^https?:\/\//.test(a.href)) {
          out[a.slug] = 'unknown';
          return;
        }
        const cached = healthCache.get(a.slug);
        if (cached && cached.exp > now) {
          out[a.slug] = cached.status;
          return;
        }
        const status = await checkHealth(a.href);
        healthCache.set(a.slug, { status, exp: now + HEALTH_TTL_MS });
        out[a.slug] = status;
      }),
    );
    return { health: out };
  });
};
