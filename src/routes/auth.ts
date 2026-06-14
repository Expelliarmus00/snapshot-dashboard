import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import {
  SESSION_COOKIE_NAME,
  clearSession,
  consumeMagicLink,
  createMagicLink,
  findUserBySession,
  isEmailAllowed,
} from '../services/auth.js';
import { sendMagicLink } from '../services/mailer.js';

const LoginSchema = z.object({
  email: z.string().email(),
});

const CallbackSchema = z.object({
  token: z.string().min(20),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  // -----------------------------------------------------------------
  // POST /api/auth/login → envoi magic link (rate limit 5 req/min/IP)
  // -----------------------------------------------------------------
  app.post(
    '/login',
    {
      config: {
        rateLimit: { max: 5, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const parsed = LoginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_email' });
      }
      const { email } = parsed.data;

      // Toujours retourner 200, même si email pas whitelisté, pour ne pas
      // révéler qui est autorisé. On envoie le mail seulement si autorisé.
      if (!isEmailAllowed(email)) {
        request.log.warn({ email }, 'login: email not whitelisted');
        return { ok: true };
      }

      try {
        const magicToken = await createMagicLink(email);
        // Le lien pointe vers l'API : elle pose le cookie puis redirige
        // vers le portail statique (front sans route /auth/callback).
        const magicUrl = `${config.APP_URL}/api/auth/callback?token=${encodeURIComponent(magicToken)}`;
        await sendMagicLink(email, magicUrl);
        request.log.info({ email }, 'login: magic link sent');
      } catch (err) {
        request.log.error({ err, email }, 'login: failed to send magic link');
        return reply.code(500).send({ error: 'mail_failed' });
      }

      return { ok: true };
    },
  );

  // -----------------------------------------------------------------
  // GET /api/auth/callback?token=... → valide, pose le cookie, redirige
  // POST /api/auth/callback { token } → idem en JSON (sans redirection)
  // -----------------------------------------------------------------
  function setSessionCookie(reply: FastifyReply, sessionToken: string) {
    const maxAgeSec = config.SESSION_TTL_DAYS * 24 * 60 * 60;
    reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
      path: '/',
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: true,
      maxAge: maxAgeSec,
    });
  }

  app.get('/callback', async (request, reply) => {
    const token = (request.query as { token?: string })?.token ?? '';
    const parsed = CallbackSchema.safeParse({ token });
    if (!parsed.success) {
      return reply.redirect('/?error=invalid_token');
    }
    const result = await consumeMagicLink(parsed.data.token);
    if (!result) {
      return reply.redirect('/?error=token_expired');
    }
    setSessionCookie(reply, result.sessionToken);
    return reply.redirect('/');
  });

  app.post('/callback', async (request, reply) => {
    const body = (request.body ?? {}) as { token?: string };
    const parsed = CallbackSchema.safeParse({ token: body.token ?? '' });
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_token' });
    }
    const result = await consumeMagicLink(parsed.data.token);
    if (!result) {
      return reply.code(401).send({ error: 'token_expired_or_invalid' });
    }
    setSessionCookie(reply, result.sessionToken);
    return reply.send({ ok: true, userId: result.userId });
  });

  // -----------------------------------------------------------------
  // POST /api/auth/logout
  // -----------------------------------------------------------------
  app.post('/logout', async (request, reply) => {
    const cookie = request.cookies[SESSION_COOKIE_NAME];
    if (cookie) {
      const unsigned = request.unsignCookie(cookie);
      if (unsigned.valid && unsigned.value) {
        await clearSession(unsigned.value);
      }
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  // -----------------------------------------------------------------
  // GET /api/auth/me — retourne l'utilisateur courant (ou 401)
  // -----------------------------------------------------------------
  app.get('/me', async (request, reply) => {
    const cookie = request.cookies[SESSION_COOKIE_NAME];
    if (!cookie) return reply.code(401).send({ error: 'unauthenticated' });

    const unsigned = request.unsignCookie(cookie);
    if (!unsigned.valid || !unsigned.value) {
      return reply.code(401).send({ error: 'invalid_session' });
    }

    const user = await findUserBySession(unsigned.value);
    if (!user) return reply.code(401).send({ error: 'session_expired' });

    return { id: user.id, email: user.email };
  });
};
