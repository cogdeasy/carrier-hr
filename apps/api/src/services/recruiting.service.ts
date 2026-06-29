import { desc, eq } from 'drizzle-orm';
import type {
  Candidate,
  CreateCandidateInput,
  CreateJobInput,
  JobRequisition,
  UpdateCandidateInput,
  UpdateJobInput,
} from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import { candidates, jobRequisitions } from '../db/schema.js';
import { NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { isoToday, nowIso } from '../lib/dates.js';
import { toCandidate, toJob } from './mappers.js';

export async function listJobs(db: Database, status?: string): Promise<JobRequisition[]> {
  const rows = await db
    .select()
    .from(jobRequisitions)
    .where(status ? eq(jobRequisitions.status, status) : undefined)
    .orderBy(desc(jobRequisitions.createdAt));
  const result: JobRequisition[] = [];
  for (const row of rows) {
    const counts = await db
      .select()
      .from(candidates)
      .where(eq(candidates.jobId, row.id));
    result.push(toJob(row, counts.length));
  }
  return result;
}

export async function getJob(db: Database, id: string): Promise<JobRequisition> {
  const [row] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, id)).limit(1);
  if (!row) throw NotFound('Job requisition not found');
  const counts = await db.select().from(candidates).where(eq(candidates.jobId, id));
  return toJob(row, counts.length);
}

export async function createJob(
  db: Database,
  recruiterId: string,
  input: CreateJobInput,
): Promise<JobRequisition> {
  const id = createId('job');
  await db.insert(jobRequisitions).values({
    id,
    title: input.title,
    department: input.department,
    location: input.location,
    employmentType: input.employmentType,
    description: input.description,
    hiringManagerId: input.hiringManagerId ?? null,
    recruiterId,
    openings: input.openings,
    salaryMinCents: input.salaryMinCents ?? null,
    salaryMaxCents: input.salaryMaxCents ?? null,
    status: 'draft',
  });
  return getJob(db, id);
}

export async function updateJob(
  db: Database,
  id: string,
  input: UpdateJobInput,
): Promise<JobRequisition> {
  const [row] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, id)).limit(1);
  if (!row) throw NotFound('Job requisition not found');
  const postedDate =
    input.status === 'open' && !row.postedDate ? isoToday() : row.postedDate;
  await db
    .update(jobRequisitions)
    .set({
      title: input.title ?? row.title,
      department: input.department ?? row.department,
      location: input.location ?? row.location,
      employmentType: input.employmentType ?? row.employmentType,
      description: input.description ?? row.description,
      hiringManagerId:
        input.hiringManagerId === undefined ? row.hiringManagerId : input.hiringManagerId,
      recruiterId: input.recruiterId === undefined ? row.recruiterId : input.recruiterId,
      openings: input.openings ?? row.openings,
      salaryMinCents: input.salaryMinCents === undefined ? row.salaryMinCents : input.salaryMinCents,
      salaryMaxCents: input.salaryMaxCents === undefined ? row.salaryMaxCents : input.salaryMaxCents,
      status: input.status ?? row.status,
      postedDate,
      updatedAt: nowIso(),
    })
    .where(eq(jobRequisitions.id, id));
  return getJob(db, id);
}

export async function listCandidates(db: Database, jobId: string): Promise<Candidate[]> {
  const rows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.jobId, jobId))
    .orderBy(desc(candidates.appliedAt));
  return rows.map(toCandidate);
}

export async function createCandidate(
  db: Database,
  input: CreateCandidateInput,
): Promise<Candidate> {
  const [job] = await db
    .select()
    .from(jobRequisitions)
    .where(eq(jobRequisitions.id, input.jobId))
    .limit(1);
  if (!job) throw NotFound('Job requisition not found');
  const id = createId('cand');
  await db.insert(candidates).values({
    id,
    jobId: input.jobId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone ?? null,
    source: input.source ?? null,
    notes: input.notes ?? null,
    stage: 'applied',
  });
  const [row] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  return toCandidate(row!);
}

export async function updateCandidate(
  db: Database,
  id: string,
  input: UpdateCandidateInput,
): Promise<Candidate> {
  const [row] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  if (!row) throw NotFound('Candidate not found');
  await db
    .update(candidates)
    .set({
      stage: input.stage ?? row.stage,
      rating: input.rating === undefined ? row.rating : input.rating,
      notes: input.notes === undefined ? row.notes : input.notes,
      updatedAt: nowIso(),
    })
    .where(eq(candidates.id, id));
  const [updated] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  return toCandidate(updated!);
}

export async function pipelineSummary(
  db: Database,
): Promise<{ stage: string; count: number }[]> {
  const rows = await db.select().from(candidates);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.stage, (map.get(r.stage) ?? 0) + 1);
  return [...map.entries()].map(([stage, count]) => ({ stage, count }));
}
