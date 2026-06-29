import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createChecklistTaskSchema,
  createOnboardingTemplateSchema,
  createTemplateItemSchema,
  instantiateChecklistSchema,
  triggerOffboardingSchema,
  updateChecklistSchema,
  updateOnboardingTaskSchema,
  updateOnboardingTemplateSchema,
  updateTemplateItemSchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import {
  addChecklistTask,
  addTemplateItem,
  createTemplate,
  deleteChecklist,
  deleteTask,
  deleteTemplate,
  deleteTemplateItem,
  getChecklist,
  getPlan,
  getTemplate,
  instantiateChecklist,
  listChecklists,
  listTemplates,
  myChecklists,
  triggerOffboarding,
  updateChecklistStatus,
  updateTask,
  updateTemplate,
  updateTemplateItem,
  type Requester,
} from '../services/onboarding.service.js';

const idParam = z.object({ id: z.string() });
const templateItemParams = z.object({ id: z.string(), itemId: z.string() });

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  const requester = (req: { principal: { employeeId: string; roles: Requester['roles'] } }): Requester => ({
    employeeId: req.principal.employeeId,
    roles: req.principal.roles,
  });

  // --- Employee-facing -----------------------------------------------------

  app.get('/plan', async (req) => getPlan(app.db, req.principal.employeeId));

  app.get('/me', async (req) => myChecklists(app.db, requester(req)));

  // --- Templates (HR/admin) ------------------------------------------------

  app.get('/templates', { onRequest: [app.requirePermission('onboarding:admin')] }, async (req) => {
    const { type } = parse(z.object({ type: z.string().optional() }), req.query);
    return listTemplates(app.db, type);
  });

  app.get(
    '/templates/:id',
    { onRequest: [app.requirePermission('onboarding:admin')] },
    async (req) => {
      const { id } = parse(idParam, req.params);
      return getTemplate(app.db, id);
    },
  );

  app.post(
    '/templates',
    { onRequest: [app.requirePermission('onboarding:admin')] },
    async (req, reply) => {
      const input = parse(createOnboardingTemplateSchema, req.body);
      const template = await createTemplate(app.db, input);
      return reply.status(201).send(template);
    },
  );

  app.patch(
    '/templates/:id',
    { onRequest: [app.requirePermission('onboarding:admin')] },
    async (req) => {
      const { id } = parse(idParam, req.params);
      const input = parse(updateOnboardingTemplateSchema, req.body);
      return updateTemplate(app.db, id, input);
    },
  );

  app.delete(
    '/templates/:id',
    { onRequest: [app.requirePermission('onboarding:admin')] },
    async (req, reply) => {
      const { id } = parse(idParam, req.params);
      await deleteTemplate(app.db, id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/templates/:id/items',
    { onRequest: [app.requirePermission('onboarding:admin')] },
    async (req, reply) => {
      const { id } = parse(idParam, req.params);
      const input = parse(createTemplateItemSchema, req.body);
      const template = await addTemplateItem(app.db, id, input);
      return reply.status(201).send(template);
    },
  );

  app.patch(
    '/templates/:id/items/:itemId',
    { onRequest: [app.requirePermission('onboarding:admin')] },
    async (req) => {
      const { id, itemId } = parse(templateItemParams, req.params);
      const input = parse(updateTemplateItemSchema, req.body);
      return updateTemplateItem(app.db, id, itemId, input);
    },
  );

  app.delete(
    '/templates/:id/items/:itemId',
    { onRequest: [app.requirePermission('onboarding:admin')] },
    async (req) => {
      const { id, itemId } = parse(templateItemParams, req.params);
      return deleteTemplateItem(app.db, id, itemId);
    },
  );

  // --- Checklists ----------------------------------------------------------

  app.get('/checklists', async (req) => {
    const { employeeId, type, status } = parse(
      z.object({
        employeeId: z.string().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
      }),
      req.query,
    );
    return listChecklists(app.db, requester(req), { employeeId, type, status });
  });

  app.get('/checklists/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getChecklist(app.db, requester(req), id);
  });

  app.post('/checklists', async (req, reply) => {
    const input = parse(instantiateChecklistSchema, req.body);
    const checklist = await instantiateChecklist(app.db, requester(req), input);
    return reply.status(201).send(checklist);
  });

  app.post(
    '/offboarding',
    { onRequest: [app.requirePermission('onboarding:admin')] },
    async (req, reply) => {
      const input = parse(triggerOffboardingSchema, req.body);
      const checklist = await triggerOffboarding(app.db, requester(req), input);
      return reply.status(201).send(checklist);
    },
  );

  app.patch('/checklists/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateChecklistSchema, req.body);
    return updateChecklistStatus(app.db, requester(req), id, input.status);
  });

  app.delete('/checklists/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    await deleteChecklist(app.db, requester(req), id);
    return reply.status(204).send();
  });

  app.post('/checklists/:id/tasks', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const input = parse(createChecklistTaskSchema, req.body);
    const checklist = await addChecklistTask(app.db, requester(req), id, input);
    return reply.status(201).send(checklist);
  });

  // --- Tasks ---------------------------------------------------------------

  app.patch('/tasks/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateOnboardingTaskSchema, req.body);
    return updateTask(app.db, requester(req), id, input.status);
  });

  app.delete('/tasks/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    await deleteTask(app.db, requester(req), id);
    return reply.status(204).send();
  });
}
