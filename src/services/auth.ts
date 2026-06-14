import crypto from 'node:crypto';
import { prisma } from '../db/client.js';
import { config } from '../config.js';

export const SESSION_COOKIE_NAME = 'snapshot_session';

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function isEmailAllowed(email: string): boolean {
  return config.ALLOWED_EMAILS.includes(email.toLowerCase().trim());
}

export async function createMagicLink(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const magicToken = generateToken(32);
  const magicExpiresAt = new Date(Date.now() + config.MAGIC_LINK_TTL_MINUTES * 60 * 1000);

  await prisma.user.upsert({
    where: { email: normalized },
    create: { email: normalized, magicToken, magicExpiresAt },
    update: { magicToken, magicExpiresAt },
  });

  return magicToken;
}

export async function consumeMagicLink(
  token: string,
): Promise<{ userId: string; sessionToken: string } | null> {
  const user = await prisma.user.findFirst({
    where: {
      magicToken: token,
      magicExpiresAt: { gt: new Date() },
    },
  });
  if (!user) return null;

  const sessionToken = generateToken(48);
  const sessionExpiresAt = new Date(Date.now() + config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      magicToken: null,
      magicExpiresAt: null,
      sessionToken,
      sessionExpiresAt,
      lastLoginAt: new Date(),
    },
  });

  return { userId: user.id, sessionToken };
}

export async function findUserBySession(sessionToken: string) {
  return prisma.user.findFirst({
    where: {
      sessionToken,
      sessionExpiresAt: { gt: new Date() },
    },
    select: { id: true, email: true },
  });
}

export async function clearSession(sessionToken: string): Promise<void> {
  await prisma.user.updateMany({
    where: { sessionToken },
    data: { sessionToken: null, sessionExpiresAt: null },
  });
}
