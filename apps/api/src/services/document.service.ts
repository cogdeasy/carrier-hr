import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { CreateDocumentInput, HrDocument } from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import { documentSignatures, documents } from '../db/schema.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { nowIso } from '../lib/dates.js';
import { toDocument } from './mappers.js';

/** Map of documentId -> signedAt for a single employee across the given docs. */
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

/** Documents visible to an employee: their own plus company-wide (null owner). */
export async function listForEmployee(db: Database, employeeId: string): Promise<HrDocument[]> {
  const rows = await db
    .select()
    .from(documents)
    .where(or(eq(documents.employeeId, employeeId), isNull(documents.employeeId)))
    .orderBy(desc(documents.createdAt));
  const signed = await signaturesForEmployee(
    db,
    employeeId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toDocument(r, signed.get(r.id) ?? null));
}

export async function listAll(db: Database): Promise<HrDocument[]> {
  const rows = await db.select().from(documents).orderBy(desc(documents.createdAt));
  const ids = rows.map((r) => r.id);
  const sigRows = ids.length
    ? await db.select().from(documentSignatures).where(inArray(documentSignatures.documentId, ids))
    : [];
  // Admin view surfaces the most recent signature on each document, if any.
  const latest = new Map<string, string>();
  for (const s of sigRows) {
    const current = latest.get(s.documentId);
    if (!current || s.signedAt > current) latest.set(s.documentId, s.signedAt);
  }
  return rows.map((r) => toDocument(r, latest.get(r.id) ?? null));
}

export async function create(
  db: Database,
  uploadedById: string,
  input: CreateDocumentInput,
): Promise<HrDocument> {
  const id = createId('doc');
  await db.insert(documents).values({
    id,
    employeeId: input.employeeId ?? null,
    name: input.name,
    category: input.category,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    url: input.url,
    requiresSignature: input.requiresSignature,
    uploadedById,
  });
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return toDocument(row!, null);
}

export async function sign(db: Database, employeeId: string, id: string): Promise<HrDocument> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!row) throw NotFound('Document not found');
  if (row.employeeId && row.employeeId !== employeeId) {
    throw Forbidden('You cannot sign this document');
  }
  if (!row.requiresSignature) {
    throw BadRequest('This document does not require a signature');
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
  }
  return toDocument(row, signedAt);
}
