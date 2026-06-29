import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import {
  listNotifications,
  markAllRead,
  markRead,
} from '../services/notification.service.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (req) => {
    const { unread } = parse(
      z.object({ unread: z.enum(['true', 'false']).optional() }),
      req.query,
    );
    return listNotifications(app.db, req.principal.employeeId, unread === 'true');
  });

  app.post('/:id/read', async (req, reply) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    await markRead(app.db, req.principal.employeeId, id);
    return reply.send({ ok: true });
  });

  app.post('/read-all', async (req, reply) => {
    await markAllRead(app.db, req.principal.employeeId);
    return reply.send({ ok: true });
  });
}
