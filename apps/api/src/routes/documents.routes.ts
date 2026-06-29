import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createDocumentSchema, hasPermission } from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import { create, listAll, listForEmployee, sign } from '../services/document.service.js';

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (req) => {
    if (hasPermission(req.principal.roles, 'document:admin')) {
      return listAll(app.db);
    }
    return listForEmployee(app.db, req.principal.employeeId);
  });

  app.post('/', { onRequest: [app.requirePermission('document:admin')] }, async (req, reply) => {
    const input = parse(createDocumentSchema, req.body);
    const doc = await create(app.db, req.principal.employeeId, input);
    return reply.status(201).send(doc);
  });

  app.post('/:id/sign', async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    return sign(app.db, req.principal.employeeId, id);
  });
}
