import { z } from 'zod';

/** Canonical document categories surfaced in the library and its filters. */
export const DOCUMENT_CATEGORIES = [
  'policy',
  'contract',
  'handbook',
  'personal',
  'general',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** A document is either company-wide (visible to everyone) or personal. */
export const DOCUMENT_VISIBILITIES = ['company', 'personal'] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

export const DOCUMENT_STATUSES = ['active', 'archived'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Lifecycle of a tracked e-signature request addressed to one employee. */
export const SIGNATURE_REQUEST_STATUSES = [
  'pending',
  'signed',
  'declined',
  'cancelled',
] as const;
export type SignatureRequestStatus = (typeof SIGNATURE_REQUEST_STATUSES)[number];

const NAME = z.string().trim().min(1).max(200);
const DESCRIPTION = z.string().trim().max(2000);
const CATEGORY = z.enum(DOCUMENT_CATEGORIES);
const CONTENT_TYPE = z.string().trim().min(1).max(120);
const URL = z.string().trim().min(1).max(2048);
const SIZE = z.number().int().min(0).max(1_000_000_000);
const MESSAGE = z.string().trim().max(1000);
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** Aggregate signature progress attached to a document for list/detail views. */
export const signatureSummarySchema = z.object({
  required: z.boolean(),
  total: z.number().int(),
  signed: z.number().int(),
  pending: z.number().int(),
  declined: z.number().int(),
});
export type SignatureSummary = z.infer<typeof signatureSummarySchema>;

export const documentSchema = z.object({
  id: z.string(),
  employeeId: z.string().nullable(),
  visibility: z.enum(DOCUMENT_VISIBILITIES),
  name: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  url: z.string(),
  version: z.number().int(),
  status: z.enum(DOCUMENT_STATUSES),
  requiresSignature: z.boolean(),
  /** Whether the requesting employee has personally signed this document. */
  signedAt: z.string().nullable(),
  signatures: signatureSummarySchema.optional(),
  uploadedById: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type HrDocument = z.infer<typeof documentSchema>;

export const documentVersionSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  version: z.number().int(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  url: z.string(),
  note: z.string().nullable(),
  uploadedById: z.string(),
  createdAt: z.string(),
});
export type DocumentVersion = z.infer<typeof documentVersionSchema>;

export const signatureRequestSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  documentName: z.string().optional(),
  employeeId: z.string(),
  requestedById: z.string(),
  status: z.enum(SIGNATURE_REQUEST_STATUSES),
  message: z.string().nullable(),
  dueDate: z.string().nullable(),
  signedAt: z.string().nullable(),
  declinedAt: z.string().nullable(),
  declineReason: z.string().nullable(),
  remindersSent: z.number().int(),
  lastReminderAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SignatureRequest = z.infer<typeof signatureRequestSchema>;

export const createDocumentSchema = z.object({
  employeeId: z.string().nullable().optional(),
  name: NAME,
  description: DESCRIPTION.optional(),
  category: CATEGORY,
  contentType: CONTENT_TYPE,
  sizeBytes: SIZE,
  url: URL,
  requiresSignature: z.boolean().default(false),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

export const updateDocumentSchema = z
  .object({
    name: NAME.optional(),
    description: DESCRIPTION.nullable().optional(),
    category: CATEGORY.optional(),
    requiresSignature: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

/** Uploading a new revision bumps the document version and archives the prior file. */
export const createDocumentVersionSchema = z.object({
  contentType: CONTENT_TYPE,
  sizeBytes: SIZE,
  url: URL,
  note: z.string().trim().max(500).optional(),
});
export type CreateDocumentVersionInput = z.infer<typeof createDocumentVersionSchema>;

export const createSignatureRequestSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1).max(500),
  message: MESSAGE.optional(),
  dueDate: ISO_DATE.optional(),
});
export type CreateSignatureRequestInput = z.infer<typeof createSignatureRequestSchema>;

export const declineSignatureSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
export type DeclineSignatureInput = z.infer<typeof declineSignatureSchema>;

export const listDocumentsQuerySchema = z.object({
  category: CATEGORY.optional(),
  visibility: z.enum(DOCUMENT_VISIBILITIES).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  requiresSignature: z.coerce.boolean().optional(),
  employeeId: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['createdAt', 'name', 'category']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const documentListSchema = z.object({
  items: z.array(documentSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type DocumentList = z.infer<typeof documentListSchema>;
