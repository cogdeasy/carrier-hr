import { and, asc, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import type {
  CreateDocumentInput,
  CreateDocumentVersionInput,
  CreateSignatureRequestInput,
  DocumentList,
  DocumentVersion,
  HrDocument,
  ListDocumentsQuery,
  SignatureRequest,
  SignatureSummary,
} from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import {
  auditLogs,
  documentSignatures,
  documentVersions,
  documents,
  employees,
  signatureRequests,
} from '../db/schema.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { nowIso } from '../lib/dates.js';
import { toDocument } from './mappers.js';
import { createNotification } from './notification.service.js';

export interface Viewer {
  employeeId: string;
  /** Holds `document:admin` — can manage documents and see every personal doc. */
  isAdmin: boolean;
}

type DocumentRow = typeof documents.$inferSelect;

async function recordAudit(
  db: Database,
  actorId: string,
  action: string,
  entityId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLogs).values({
    id: createId('aud'),
    actorId,
    action,
    entity: 'document',
    entityId,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

/** A personal document is visible only to its owner and document admins. */
function canView(viewer: Viewer, row: Pick<DocumentRow, 'employeeId'>): boolean {
  if (!row.employeeId) return true;
  return viewer.isAdmin || row.employeeId === viewer.employeeId;
}

async function loadDocument(db: Database, id: string): Promise<DocumentRow> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!row) throw NotFound('Document not found');
  return row;
}

/** Map of documentId -> signedAt for one employee across the given documents. */
async function signaturesForEmployee(
  db: Database,
  employeeId: string,
  documentIds: string[],
): Promise<Map<string, string>> {
  if (documentIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(documentSignatures)
    .where(
      and(
        eq(documentSignatures.employeeId, employeeId),
        inArray(documentSignatures.documentId, documentIds),
      ),
    );
  return new Map(rows.map((r) => [r.documentId, r.signedAt]));
}

/** Aggregate signature progress for a batch of documents (no N+1). */
async function signatureSummaries(
  db: Database,
  rows: DocumentRow[],
): Promise<Map<string, SignatureSummary>> {
  const ids = rows.map((r) => r.id);
  const summaries = new Map<string, SignatureSummary>();
  for (const r of rows) {
    summaries.set(r.id, {
      required: r.requiresSignature,
      total: 0,
      signed: 0,
      pending: 0,
      declined: 0,
    });
  }
  if (ids.length === 0) return summaries;

  const sigRows = await db
    .select({ documentId: documentSignatures.documentId })
    .from(documentSignatures)
    .where(inArray(documentSignatures.documentId, ids));
  for (const s of sigRows) {
    const summary = summaries.get(s.documentId);
    if (summary) summary.signed += 1;
  }

  const reqRows = await db
    .select({ documentId: signatureRequests.documentId, status: signatureRequests.status })
    .from(signatureRequests)
    .where(inArray(signatureRequests.documentId, ids));
  for (const req of reqRows) {
    const summary = summaries.get(req.documentId);
    if (!summary) continue;
    if (req.status === 'cancelled') continue;
    summary.total += 1;
    if (req.status === 'pending') summary.pending += 1;
    else if (req.status === 'declined') summary.declined += 1;
  }
  return summaries;
}

export async function listDocuments(
  db: Database,
  viewer: Viewer,
  query: ListDocumentsQuery,
): Promise<DocumentList> {
  const filters = [];

  if (!viewer.isAdmin) {
    filters.push(or(isNull(documents.employeeId), eq(documents.employeeId, viewer.employeeId)));
  } else if (query.employeeId) {
    filters.push(eq(documents.employeeId, query.employeeId));
  }

  if (query.visibility === 'company') filters.push(isNull(documents.employeeId));
  if (query.visibility === 'personal') filters.push(sql`${documents.employeeId} is not null`);
  if (query.category) filters.push(eq(documents.category, query.category));
  if (query.status) filters.push(eq(documents.status, query.status));
  if (query.requiresSignature !== undefined) {
    filters.push(eq(documents.requiresSignature, query.requiresSignature));
  }
  if (query.q) filters.push(like(documents.name, `%${query.q}%`));

  const where = filters.length ? and(...filters) : undefined;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(documents)
    .where(where);
  const count = countRow?.count ?? 0;

  const sortColumn =
    query.sort === 'name'
      ? documents.name
      : query.sort === 'category'
        ? documents.category
        : documents.createdAt;
  const direction = query.order === 'asc' ? asc : desc;

  const rows = await db
    .select()
    .from(documents)
    .where(where)
    .orderBy(direction(sortColumn))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const signed = await signaturesForEmployee(
    db,
    viewer.employeeId,
    rows.map((r) => r.id),
  );
  const summaries = await signatureSummaries(db, rows);

  return {
    items: rows.map((r) => toDocument(r, signed.get(r.id) ?? null, summaries.get(r.id))),
    total: Number(count),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getDocument(db: Database, viewer: Viewer, id: string): Promise<HrDocument> {
  const row = await loadDocument(db, id);
  if (!canView(viewer, row)) throw Forbidden('You cannot access this document');
  const signed = await signaturesForEmployee(db, viewer.employeeId, [id]);
  const summaries = await signatureSummaries(db, [row]);
  return toDocument(row, signed.get(id) ?? null, summaries.get(id));
}

async function assertEmployeeExists(db: Database, employeeId: string): Promise<void> {
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!row) throw BadRequest('Employee not found');
}

export async function createDocument(
  db: Database,
  actorId: string,
  input: CreateDocumentInput,
): Promise<HrDocument> {
  if (input.employeeId) await assertEmployeeExists(db, input.employeeId);

  const id = createId('doc');
  const now = nowIso();
  await db.insert(documents).values({
    id,
    employeeId: input.employeeId ?? null,
    name: input.name,
    description: input.description ?? null,
    category: input.category,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    url: input.url,
    version: 1,
    status: 'active',
    requiresSignature: input.requiresSignature,
    uploadedById: actorId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(documentVersions).values({
    id: createId('dvr'),
    documentId: id,
    version: 1,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    url: input.url,
    note: 'Initial version',
    uploadedById: actorId,
  });
  await recordAudit(db, actorId, 'document.create', id, { category: input.category });

  const row = await loadDocument(db, id);
  return toDocument(row, null, (await signatureSummaries(db, [row])).get(id));
}

export async function updateDocument(
  db: Database,
  actorId: string,
  id: string,
  input: { name?: string; description?: string | null; category?: string; requiresSignature?: boolean },
): Promise<HrDocument> {
  await loadDocument(db, id);
  const patch: Partial<DocumentRow> = { updatedAt: nowIso() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;
  if (input.requiresSignature !== undefined) patch.requiresSignature = input.requiresSignature;

  await db.update(documents).set(patch).where(eq(documents.id, id));
  await recordAudit(db, actorId, 'document.update', id, { fields: Object.keys(input) });

  const row = await loadDocument(db, id);
  return toDocument(row, null, (await signatureSummaries(db, [row])).get(id));
}

export async function setDocumentStatus(
  db: Database,
  actorId: string,
  id: string,
  status: 'active' | 'archived',
): Promise<HrDocument> {
  const row = await loadDocument(db, id);
  if (row.status === status) {
    throw BadRequest(`Document is already ${status}`);
  }
  await db.update(documents).set({ status, updatedAt: nowIso() }).where(eq(documents.id, id));
  await recordAudit(db, actorId, status === 'archived' ? 'document.archive' : 'document.restore', id);
  const updated = await loadDocument(db, id);
  return toDocument(updated, null, (await signatureSummaries(db, [updated])).get(id));
}

export async function addVersion(
  db: Database,
  actorId: string,
  id: string,
  input: CreateDocumentVersionInput,
): Promise<HrDocument> {
  const row = await loadDocument(db, id);
  const nextVersion = row.version + 1;
  await db.insert(documentVersions).values({
    id: createId('dvr'),
    documentId: id,
    version: nextVersion,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    url: input.url,
    note: input.note ?? null,
    uploadedById: actorId,
  });
  await db
    .update(documents)
    .set({
      version: nextVersion,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      url: input.url,
      updatedAt: nowIso(),
    })
    .where(eq(documents.id, id));
  await recordAudit(db, actorId, 'document.version', id, { version: nextVersion });

  const updated = await loadDocument(db, id);
  return toDocument(updated, null, (await signatureSummaries(db, [updated])).get(id));
}

export async function listVersions(
  db: Database,
  viewer: Viewer,
  id: string,
): Promise<DocumentVersion[]> {
  const row = await loadDocument(db, id);
  if (!canView(viewer, row)) throw Forbidden('You cannot access this document');
  const rows = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, id))
    .orderBy(desc(documentVersions.version));
  return rows.map((r) => ({
    id: r.id,
    documentId: r.documentId,
    version: r.version,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    url: r.url,
    note: r.note,
    uploadedById: r.uploadedById,
    createdAt: r.createdAt,
  }));
}

function toSignatureRequest(
  r: typeof signatureRequests.$inferSelect,
  documentName?: string,
): SignatureRequest {
  return {
    id: r.id,
    documentId: r.documentId,
    documentName,
    employeeId: r.employeeId,
    requestedById: r.requestedById,
    status: r.status as SignatureRequest['status'],
    message: r.message,
    dueDate: r.dueDate,
    signedAt: r.signedAt,
    declinedAt: r.declinedAt,
    declineReason: r.declineReason,
    remindersSent: r.remindersSent,
    lastReminderAt: r.lastReminderAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function sign(db: Database, employeeId: string, id: string): Promise<HrDocument> {
  const row = await loadDocument(db, id);
  if (row.employeeId && row.employeeId !== employeeId) {
    throw Forbidden('You cannot sign this document');
  }
  if (!row.requiresSignature) {
    throw BadRequest('This document does not require a signature');
  }
  if (row.status === 'archived') {
    throw BadRequest('This document has been archived');
  }

  const [existing] = await db
    .select()
    .from(documentSignatures)
    .where(
      and(eq(documentSignatures.documentId, id), eq(documentSignatures.employeeId, employeeId)),
    )
    .limit(1);

  let signedAt = existing?.signedAt;
  if (!signedAt) {
    signedAt = nowIso();
    await db
      .insert(documentSignatures)
      .values({ id: createId('dsg'), documentId: id, employeeId, signedAt });
    await db
      .update(signatureRequests)
      .set({ status: 'signed', signedAt, updatedAt: signedAt })
      .where(
        and(
          eq(signatureRequests.documentId, id),
          eq(signatureRequests.employeeId, employeeId),
          inArray(signatureRequests.status, ['pending', 'declined']),
        ),
      );
    await recordAudit(db, employeeId, 'document.sign', id, { signedAt });
  }
  const summaries = await signatureSummaries(db, [row]);
  return toDocument(row, signedAt, summaries.get(id));
}

export async function declineSignature(
  db: Database,
  employeeId: string,
  id: string,
  reason: string,
): Promise<SignatureRequest> {
  await loadDocument(db, id);
  const [request] = await db
    .select()
    .from(signatureRequests)
    .where(
      and(eq(signatureRequests.documentId, id), eq(signatureRequests.employeeId, employeeId)),
    )
    .limit(1);
  if (!request) throw NotFound('No signature request found for you on this document');
  if (request.status === 'signed') throw BadRequest('You have already signed this document');
  if (request.status === 'cancelled') throw BadRequest('This signature request was cancelled');

  const now = nowIso();
  await db
    .update(signatureRequests)
    .set({ status: 'declined', declinedAt: now, declineReason: reason, updatedAt: now })
    .where(eq(signatureRequests.id, request.id));
  await createNotification(db, {
    employeeId: request.requestedById,
    type: 'document_request',
    title: 'Signature declined',
    body: `A signature request was declined: ${reason}`,
    link: '/documents',
  });
  await recordAudit(db, employeeId, 'document.decline', id, { requestId: request.id });

  const [updated] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.id, request.id))
    .limit(1);
  return toSignatureRequest(updated!);
}

export async function createSignatureRequests(
  db: Database,
  actorId: string,
  documentId: string,
  input: CreateSignatureRequestInput,
): Promise<SignatureRequest[]> {
  const doc = await loadDocument(db, documentId);
  if (doc.status === 'archived') throw BadRequest('Cannot request signatures on an archived document');

  const targetIds = [...new Set(input.employeeIds)];
  const found = await db
    .select({ id: employees.id })
    .from(employees)
    .where(inArray(employees.id, targetIds));
  const validIds = new Set(found.map((e) => e.id));
  const missing = targetIds.filter((tid) => !validIds.has(tid));
  if (missing.length > 0) throw BadRequest(`Unknown employee(s): ${missing.join(', ')}`);

  // A personal document can only be signed by its owner; block fan-out to others.
  if (doc.employeeId && targetIds.some((tid) => tid !== doc.employeeId)) {
    throw BadRequest('A personal document can only be sent to its owner for signature');
  }

  if (!doc.requiresSignature) {
    await db
      .update(documents)
      .set({ requiresSignature: true, updatedAt: nowIso() })
      .where(eq(documents.id, documentId));
  }

  const existing = await db
    .select()
    .from(signatureRequests)
    .where(
      and(
        eq(signatureRequests.documentId, documentId),
        inArray(signatureRequests.employeeId, targetIds),
      ),
    );
  const existingByEmployee = new Map(existing.map((r) => [r.employeeId, r]));

  const results: SignatureRequest[] = [];
  for (const employeeId of targetIds) {
    const prior = existingByEmployee.get(employeeId);
    const now = nowIso();
    if (prior) {
      if (prior.status === 'signed') {
        results.push(toSignatureRequest(prior));
        continue;
      }
      // Re-open a previously cancelled/declined request rather than duplicating.
      await db
        .update(signatureRequests)
        .set({
          status: 'pending',
          requestedById: actorId,
          message: input.message ?? null,
          dueDate: input.dueDate ?? null,
          declinedAt: null,
          declineReason: null,
          updatedAt: now,
        })
        .where(eq(signatureRequests.id, prior.id));
      const [reopened] = await db
        .select()
        .from(signatureRequests)
        .where(eq(signatureRequests.id, prior.id))
        .limit(1);
      results.push(toSignatureRequest(reopened!));
    } else {
      const id = createId('sgr');
      await db.insert(signatureRequests).values({
        id,
        documentId,
        employeeId,
        requestedById: actorId,
        status: 'pending',
        message: input.message ?? null,
        dueDate: input.dueDate ?? null,
        createdAt: now,
        updatedAt: now,
      });
      const [created] = await db
        .select()
        .from(signatureRequests)
        .where(eq(signatureRequests.id, id))
        .limit(1);
      results.push(toSignatureRequest(created!));
    }
    await createNotification(db, {
      employeeId,
      type: 'document_request',
      title: 'Signature requested',
      body: `Please review and sign "${doc.name}".`,
      link: '/documents',
    });
  }
  await recordAudit(db, actorId, 'document.request_signatures', documentId, {
    count: targetIds.length,
  });
  return results;
}

export async function listSignatureRequests(
  db: Database,
  viewer: Viewer,
  documentId: string,
): Promise<SignatureRequest[]> {
  const row = await loadDocument(db, documentId);
  if (!canView(viewer, row)) throw Forbidden('You cannot access this document');
  const filters = [eq(signatureRequests.documentId, documentId)];
  // Non-admins only see their own request on a document, never their peers'.
  if (!viewer.isAdmin) filters.push(eq(signatureRequests.employeeId, viewer.employeeId));
  const rows = await db
    .select()
    .from(signatureRequests)
    .where(and(...filters))
    .orderBy(desc(signatureRequests.createdAt));
  return rows.map((r) => toSignatureRequest(r));
}

export async function remindSignatureRequest(
  db: Database,
  actorId: string,
  requestId: string,
): Promise<SignatureRequest> {
  const [request] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.id, requestId))
    .limit(1);
  if (!request) throw NotFound('Signature request not found');
  if (request.status !== 'pending') throw BadRequest('Only pending requests can be reminded');

  const now = nowIso();
  await db
    .update(signatureRequests)
    .set({ remindersSent: sql`${signatureRequests.remindersSent} + 1`, lastReminderAt: now, updatedAt: now })
    .where(eq(signatureRequests.id, requestId));

  const [doc] = await db
    .select({ name: documents.name })
    .from(documents)
    .where(eq(documents.id, request.documentId))
    .limit(1);
  await createNotification(db, {
    employeeId: request.employeeId,
    type: 'document_request',
    title: 'Signature reminder',
    body: `Reminder: please sign "${doc?.name ?? 'a document'}".`,
    link: '/documents',
  });
  await recordAudit(db, actorId, 'document.remind', request.documentId, { requestId });

  const [updated] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.id, requestId))
    .limit(1);
  return toSignatureRequest(updated!);
}

export async function cancelSignatureRequest(
  db: Database,
  actorId: string,
  requestId: string,
): Promise<SignatureRequest> {
  const [request] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.id, requestId))
    .limit(1);
  if (!request) throw NotFound('Signature request not found');
  if (request.status === 'signed') throw BadRequest('A signed request cannot be cancelled');
  if (request.status === 'cancelled') throw BadRequest('Request is already cancelled');

  const now = nowIso();
  await db
    .update(signatureRequests)
    .set({ status: 'cancelled', updatedAt: now })
    .where(eq(signatureRequests.id, requestId));
  await recordAudit(db, actorId, 'document.cancel_request', request.documentId, { requestId });

  const [updated] = await db
    .select()
    .from(signatureRequests)
    .where(eq(signatureRequests.id, requestId))
    .limit(1);
  return toSignatureRequest(updated!);
}

/** Pending signature requests addressed to the employee, newest first. */
export async function listMySignatureRequests(
  db: Database,
  employeeId: string,
): Promise<SignatureRequest[]> {
  const rows = await db
    .select()
    .from(signatureRequests)
    .where(
      and(eq(signatureRequests.employeeId, employeeId), eq(signatureRequests.status, 'pending')),
    )
    .orderBy(desc(signatureRequests.createdAt));
  if (rows.length === 0) return [];
  const docRows = await db
    .select({ id: documents.id, name: documents.name })
    .from(documents)
    .where(inArray(documents.id, rows.map((r) => r.documentId)));
  const names = new Map(docRows.map((d) => [d.id, d.name]));
  return rows.map((r) => toSignatureRequest(r, names.get(r.documentId)));
}

/** Documents the employee still needs to sign: mandatory company docs plus
 *  any document targeted by a pending request, minus what they've signed. */
export async function inboxForEmployee(db: Database, employeeId: string): Promise<HrDocument[]> {
  const requestRows = await db
    .select({ documentId: signatureRequests.documentId })
    .from(signatureRequests)
    .where(
      and(eq(signatureRequests.employeeId, employeeId), eq(signatureRequests.status, 'pending')),
    );
  const requestedDocIds = requestRows.map((r) => r.documentId);

  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.requiresSignature, true),
        eq(documents.status, 'active'),
        or(
          isNull(documents.employeeId),
          eq(documents.employeeId, employeeId),
          requestedDocIds.length ? inArray(documents.id, requestedDocIds) : sql`0 = 1`,
        ),
      ),
    )
    .orderBy(desc(documents.createdAt));

  const signed = await signaturesForEmployee(db, employeeId, rows.map((r) => r.id));
  const summaries = await signatureSummaries(db, rows);
  return rows
    .filter((r) => !signed.has(r.id))
    .map((r) => toDocument(r, null, summaries.get(r.id)));
}
