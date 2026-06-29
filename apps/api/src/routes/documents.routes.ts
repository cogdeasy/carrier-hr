import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createDocumentSchema,
  createDocumentVersionSchema,
  createSignatureRequestSchema,
  declineSignatureSchema,
  hasPermission,
  listDocumentsQuerySchema,
  updateDocumentSchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import {
  addVersion,
  cancelSignatureRequest,
  createDocument,
  createSignatureRequests,
  declineSignature,
  getDocument,
  inboxForEmployee,
  listDocuments,
  listMySignatureRequests,
  listSignatureRequests,
  listVersions,
  remindSignatureRequest,
  setDocumentStatus,
  sign,
  updateDocument,
  type Viewer,
} from '../services/document.service.js';

const idParam = z.object({ id: z.string().min(1) });
const requestIdParam = z.object({ requestId: z.string().min(1) });

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  const viewerOf = (req: { principal: { employeeId: string; roles: Parameters<typeof hasPermission>[0] } }): Viewer => ({
    employeeId: req.principal.employeeId,
    isAdmin: hasPermission(req.principal.roles, 'document:admin'),
  });

  app.get('/', async (req) => {
    const query = parse(listDocumentsQuerySchema, req.query);
    return listDocuments(app.db, viewerOf(req), query);
  });

  app.get('/inbox', async (req) => inboxForEmployee(app.db, req.principal.employeeId));

  app.get('/signature-requests/mine', async (req) =>
    listMySignatureRequests(app.db, req.principal.employeeId),
  );

  app.post(
    '/signature-requests/:requestId/remind',
    { onRequest: [app.requirePermission('document:admin')] },
    async (req) => {
      const { requestId } = parse(requestIdParam, req.params);
      return remindSignatureRequest(app.db, req.principal.employeeId, requestId);
    },
  );

  app.post(
    '/signature-requests/:requestId/cancel',
    { onRequest: [app.requirePermission('document:admin')] },
    async (req) => {
      const { requestId } = parse(requestIdParam, req.params);
      return cancelSignatureRequest(app.db, req.principal.employeeId, requestId);
    },
  );

  app.post('/', { onRequest: [app.requirePermission('document:admin')] }, async (req, reply) => {
    const input = parse(createDocumentSchema, req.body);
    const doc = await createDocument(app.db, req.principal.employeeId, input);
    return reply.status(201).send(doc);
  });

  app.get('/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    return getDocument(app.db, viewerOf(req), id);
  });

  app.patch('/:id', { onRequest: [app.requirePermission('document:admin')] }, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateDocumentSchema, req.body);
    return updateDocument(app.db, req.principal.employeeId, id, input);
  });

  app.get('/:id/versions', async (req) => {
    const { id } = parse(idParam, req.params);
    return listVersions(app.db, viewerOf(req), id);
  });

  app.post(
    '/:id/versions',
    { onRequest: [app.requirePermission('document:admin')] },
    async (req, reply) => {
      const { id } = parse(idParam, req.params);
      const input = parse(createDocumentVersionSchema, req.body);
      const doc = await addVersion(app.db, req.principal.employeeId, id, input);
      return reply.status(201).send(doc);
    },
  );

  app.post('/:id/archive', { onRequest: [app.requirePermission('document:admin')] }, async (req) => {
    const { id } = parse(idParam, req.params);
    return setDocumentStatus(app.db, req.principal.employeeId, id, 'archived');
  });

  app.post('/:id/restore', { onRequest: [app.requirePermission('document:admin')] }, async (req) => {
    const { id } = parse(idParam, req.params);
    return setDocumentStatus(app.db, req.principal.employeeId, id, 'active');
  });

  app.get('/:id/signatures', async (req) => {
    const { id } = parse(idParam, req.params);
    return listSignatureRequests(app.db, viewerOf(req), id);
  });

  app.post(
    '/:id/signature-requests',
    { onRequest: [app.requirePermission('document:admin')] },
    async (req, reply) => {
      const { id } = parse(idParam, req.params);
      const input = parse(createSignatureRequestSchema, req.body);
      const created = await createSignatureRequests(app.db, req.principal.employeeId, id, input);
      return reply.status(201).send(created);
    },
  );

  app.post('/:id/sign', async (req) => {
    const { id } = parse(idParam, req.params);
    return sign(app.db, req.principal.employeeId, id);
  });

  app.post('/:id/decline', async (req) => {
    const { id } = parse(idParam, req.params);
    const { reason } = parse(declineSignatureSchema, req.body);
    return declineSignature(app.db, req.principal.employeeId, id, reason);
  });
}
