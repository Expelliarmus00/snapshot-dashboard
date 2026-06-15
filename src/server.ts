import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { prisma } from './db/client.js';
import { authRoutes } from './routes/auth.js';
import { appsRoutes } from './routes/apps.js';
import { authMiddleware } from './middleware/auth.js';
import { findUserBySession, SESSION_COOKIE_NAME } from './services/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'development' ? 'debug' : 'info',
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', colorize: true } }
        : undefined,
  },
  trustProxy: true,
});

await app.register(cors, {
  origin: (origin, cb) => {
    // Accepte tout sous-domaine snapshotmedia.ch + localhost en dev
    if (!origin) return cb(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
    if (/^https:\/\/[a-z0-9-]+\.snapshotmedia\.ch$/.test(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed'), false);
  },
  credentials: true,
});

await app.register(cookie, {
  secret: config.SESSION_SECRET,
  hook: 'onRequest',
});

// Rate limit global : 300 req/min/IP. Les routes sensibles (auth/login 5/min)
// gardent leur propre override.
await app.register(rateLimit, {
  global: true,
  max: 300,
  timeWindow: '1 minute',
  allowList: ['127.0.0.1'],
});

// Health check (public)
app.get('/health', async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok', uptime: process.uptime() };
  } catch (err) {
    app.log.error({ err }, 'health: db check failed');
    return { status: 'degraded', db: 'error', uptime: process.uptime() };
  }
});

// Auth routes (public)
await app.register(authRoutes, { prefix: '/api/auth' });

// Route publique : validation de session cross-origin pour les mini-apps
app.get('/api/auth/validate', async (request, reply) => {
  const cookie = request.cookies[SESSION_COOKIE_NAME];
  if (!cookie) return reply.send({ valid: false });

  const unsigned = request.unsignCookie(cookie);
  if (!unsigned.valid || !unsigned.value) return reply.send({ valid: false });

  const user = await findUserBySession(unsigned.value);
  if (!user) return reply.send({ valid: false });

  return reply.send({ valid: true, user: { id: user.id, email: user.email } });
});

// Routes protégées (session requise)
await app.register(
  async (instance) => {
    instance.addHook('preHandler', authMiddleware);
    await instance.register(appsRoutes);
  },
  { prefix: '/api' },
);

// Front statique : portail + apps (servi publiquement, l'API gère l'accès).
await app.register(fastifyStatic, {
  root: PUBLIC_DIR,
  index: ['index.html'],
});

// Toute route non-API inconnue → portail (le front gère login + navigation).
app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'not_found' });
  }
  return reply.sendFile('index.html');
});

const start = async () => {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`Snapshot Dashboard listening on :${config.PORT} (${config.NODE_ENV})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down gracefully');
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
