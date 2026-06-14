import type { FastifyRequest, FastifyReply } from 'fastify';
import { findUserBySession, SESSION_COOKIE_NAME } from '../services/auth.js';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const cookie = request.cookies[SESSION_COOKIE_NAME];
  if (!cookie) {
    return reply.code(401).send({ error: 'unauthenticated' });
  }

  // Les cookies signés sont préfixés et vérifiés via unsignCookie.
  const unsigned = request.unsignCookie(cookie);
  if (!unsigned.valid || !unsigned.value) {
    return reply.code(401).send({ error: 'invalid_session' });
  }

  const user = await findUserBySession(unsigned.value);
  if (!user) {
    return reply.code(401).send({ error: 'session_expired' });
  }

  request.user = user;
}
