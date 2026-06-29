import { desc, eq, isNull, or } from 'drizzle-orm';
import type { CreateDocumentInput, HrDocument } from '@carrier-hr/shared';
import type { Database } from '../db/client.js';
import { documents } from '../db/schema.js';
import { Forbidden, NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { nowIso } from '../lib/dates.js';
import { toDocument } from './mappers.js';

/** Documents visible to an employee: their own plus company-wide (null owner). */
export async function listForEmployee(db: Database, employeeId: string): Promise<HrDocument[]> {
  const rows = await db
    .select()
    .from(documents)
    .where(or(eq(documents.employeeId, employeeId), isNull(documents.employeeId)))
    .orderBy(desc(documents.createdAt));
  return rows.map(toDocument);
}

export async function listAll(db: Database): Promise<HrDocument[]> {
  const rows = await db.select().from(documents).orderBy(desc(documents.createdAt));
  return rows.map(toDocument);
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
  return toDocument(row!);
}

export async function sign(
  db: Database,
  employeeId: string,
  id: string,
): Promise<HrDocument> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!row) throw NotFound('Document not found');
  if (row.employeeId && row.employeeId !== employeeId) {
    throw Forbidden('You cannot sign this document');
  }
  await db.update(documents).set({ signedAt: nowIso() }).where(eq(documents.id, id));
  const [updated] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return toDocument(updated!);
}
