import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  listNotificationsQuerySchema,
  updateNotificationPreferencesSchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import {
  deleteNotification,
  getPreferences,
  listNotifications,
  markAllRead,
  markRead,
  setPreferences,
  unreadCount,
} from '../services/notification.service.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (req) => {
    const query = parse(listNotificationsQuerySchema, req.query);
    return listNotifications(app.db, req.principal.employeeId, query);
  });

  app.get('/unread-count', async (req) => {
    const count = await unreadCount(app.db, req.principal.employeeId);
    return { count };
  });

  app.get('/preferences', async (req) => {
    const preferences = await getPreferences(app.db, req.principal.employeeId);
    return { preferences };
  });

  app.put('/preferences', async (req) => {
    const { preferences } = parse(updateNotificationPreferencesSchema, req.body);
    const updated = await setPreferences(app.db, req.principal.employeeId, preferences);
    return { preferences: updated };
  });

  app.post('/:id/read', async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params);
    await markRead(app.db, req.principal.employeeId, id);
    return reply.send({ ok: true });
  });

  app.post('/read-all', async (req) => {
    const updated = await markAllRead(app.db, req.principal.employeeId);
    return { updated };
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params);
    await deleteNotification(app.db, req.principal.employeeId, id);
    return reply.send({ ok: true });
  });
}
