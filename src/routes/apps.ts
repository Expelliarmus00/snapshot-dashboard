import type { FastifyPluginAsync } from 'fastify';
import { APPS } from '../apps.js';

/** Répertoire des apps exposé au portail (protégé). */
export const appsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/apps', async () => ({ apps: APPS }));
};
