import { z } from 'zod';

export const documentSchema = z.object({
  id: z.string(),
  employeeId: z.string().nullable(),
  name: z.string(),
  category: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  url: z.string(),
  requiresSignature: z.boolean(),
  signedAt: z.string().nullable(),
  uploadedById: z.string(),
  createdAt: z.string(),
});
export type HrDocument = z.infer<typeof documentSchema>;

export const createDocumentSchema = z.object({
  employeeId: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(120),
  contentType: z.string().min(1).max(120),
  sizeBytes: z.number().int().min(0),
  url: z.string().min(1),
  requiresSignature: z.boolean().default(false),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
