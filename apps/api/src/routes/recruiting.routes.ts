import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createCandidateSchema,
  createJobSchema,
  updateCandidateSchema,
  updateJobSchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import {
  createCandidate,
  createJob,
  getJob,
  listCandidates,
  listJobs,
  pipelineSummary,
  updateCandidate,
  updateJob,
} from '../services/recruiting.service.js';

export async function recruitingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  app.get('/jobs', { onRequest: [app.requirePermission('recruiting:read')] }, async (req) => {
    const { status } = parse(z.object({ status: z.string().optional() }), req.query);
    return listJobs(app.db, status);
  });

  app.get('/pipeline', { onRequest: [app.requirePermission('recruiting:read')] }, async () =>
    pipelineSummary(app.db),
  );

  app.get('/jobs/:id', { onRequest: [app.requirePermission('recruiting:read')] }, async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    return getJob(app.db, id);
  });

  app.post('/jobs', { onRequest: [app.requirePermission('recruiting:write')] }, async (req, reply) => {
    const input = parse(createJobSchema, req.body);
    const job = await createJob(app.db, req.principal.employeeId, input);
    return reply.status(201).send(job);
  });

  app.patch('/jobs/:id', { onRequest: [app.requirePermission('recruiting:write')] }, async (req) => {
    const { id } = parse(z.object({ id: z.string() }), req.params);
    const input = parse(updateJobSchema, req.body);
    return updateJob(app.db, id, input);
  });

  app.get(
    '/jobs/:id/candidates',
    { onRequest: [app.requirePermission('recruiting:read')] },
    async (req) => {
      const { id } = parse(z.object({ id: z.string() }), req.params);
      return listCandidates(app.db, id);
    },
  );

  app.post(
    '/candidates',
    { onRequest: [app.requirePermission('recruiting:write')] },
    async (req, reply) => {
      const input = parse(createCandidateSchema, req.body);
      const candidate = await createCandidate(app.db, input);
      return reply.status(201).send(candidate);
    },
  );

  app.patch(
    '/candidates/:id',
    { onRequest: [app.requirePermission('recruiting:write')] },
    async (req) => {
      const { id } = parse(z.object({ id: z.string() }), req.params);
      const input = parse(updateCandidateSchema, req.body);
      return updateCandidate(app.db, id, input);
    },
  );
}
