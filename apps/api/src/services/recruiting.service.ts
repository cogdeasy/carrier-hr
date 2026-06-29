import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import {
  hasPermission,
  type CandidateDetail,
  type CandidateStageEvent,
  type CreateCandidateInput,
  type CreateJobInput,
  type CreateOfferInput,
  type Candidate,
  type Interview,
  type JobRequisition,
  type JobStatusActionInput,
  type ListJobsQuery,
  type MoveCandidateStageInput,
  type OfferActionInput,
  type Offer,
  type Paginated,
  type Role,
  type ScheduleInterviewInput,
  type Scorecard,
  type SubmitScorecardInput,
  type UpdateCandidateInput,
  type UpdateInterviewInput,
  type UpdateJobInput,
  type UpdateOfferInput,
} from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import {
  candidateStageEvents,
  candidates,
  employees,
  interviewScorecards,
  interviews,
  jobRequisitions,
  offers,
} from '../db/schema.js';
import { BadRequest, Conflict, Forbidden, NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { isoToday, nowIso } from '../lib/dates.js';
import { displayName, toCandidate, toJob } from './mappers.js';

type JobRow = InferSelectModel<typeof jobRequisitions>;
type CandidateRow = InferSelectModel<typeof candidates>;
type InterviewRow = InferSelectModel<typeof interviews>;
type ScorecardRow = InferSelectModel<typeof interviewScorecards>;
type OfferRow = InferSelectModel<typeof offers>;
type StageEventRow = InferSelectModel<typeof candidateStageEvents>;

export interface RecruitingActor {
  employeeId: string;
  roles: Role[];
}

const ACTIVE_STAGES = ['applied', 'screening', 'interview', 'offer'] as const;
const TERMINAL_STAGES = ['hired', 'rejected'] as const;

/** Allowed candidate pipeline transitions; terminal stages are immutable. */
const STAGE_TRANSITIONS: Record<string, readonly string[]> = {
  applied: ['screening', 'rejected'],
  screening: ['applied', 'interview', 'rejected'],
  interview: ['screening', 'offer', 'rejected'],
  offer: ['interview', 'hired', 'rejected'],
  hired: [],
  rejected: [],
};

/** Allowed manual job status transitions; `open` requires approval, `filled` is system-set. */
const JOB_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['closed'],
  open: ['on_hold', 'closed'],
  on_hold: ['open', 'closed'],
  closed: [],
  filled: [],
};

function canManage(roles: Role[]): boolean {
  return hasPermission(roles, 'recruiting:write');
}

function assertJobVisible(job: JobRow, actor: RecruitingActor): void {
  if (canManage(actor.roles)) return;
  if (job.hiringManagerId === actor.employeeId) return;
  throw Forbidden('You do not have access to this requisition');
}

async function assertCandidateVisible(
  db: Database,
  candidate: CandidateRow,
  actor: RecruitingActor,
): Promise<void> {
  if (canManage(actor.roles)) return;
  assertJobVisible(await loadJob(db, candidate.jobId), actor);
}

/** Escapes LIKE metacharacters so user search text matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------------------
// Mappers (module-local)
// ---------------------------------------------------------------------------

function toStageEvent(row: StageEventRow, name?: string | null): CandidateStageEvent {
  return {
    id: row.id,
    candidateId: row.candidateId,
    fromStage: (row.fromStage as CandidateStageEvent['fromStage']) ?? null,
    toStage: row.toStage as CandidateStageEvent['toStage'],
    note: row.note,
    changedById: row.changedById,
    changedByName: name ?? null,
    createdAt: row.createdAt,
  };
}

function toScorecard(row: ScorecardRow, name?: string | null): Scorecard {
  return {
    id: row.id,
    interviewId: row.interviewId,
    candidateId: row.candidateId,
    interviewerId: row.interviewerId,
    interviewerName: name ?? null,
    rating: row.rating,
    recommendation: row.recommendation as Scorecard['recommendation'],
    strengths: row.strengths,
    concerns: row.concerns,
    comments: row.comments,
    createdAt: row.createdAt,
  };
}

function toInterview(
  row: InterviewRow,
  opts?: { interviewerName?: string | null; scorecard?: Scorecard | null },
): Interview {
  return {
    id: row.id,
    candidateId: row.candidateId,
    jobId: row.jobId,
    interviewerId: row.interviewerId,
    interviewerName: opts?.interviewerName ?? null,
    scheduledAt: row.scheduledAt,
    durationMinutes: row.durationMinutes,
    mode: row.mode as Interview['mode'],
    stage: row.stage,
    location: row.location,
    status: row.status as Interview['status'],
    scorecard: opts?.scorecard ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    candidateId: row.candidateId,
    jobId: row.jobId,
    salaryCents: row.salaryCents,
    startDate: row.startDate,
    status: row.status as Offer['status'],
    expiresAt: row.expiresAt,
    notes: row.notes,
    extendedById: row.extendedById,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function candidateCounts(
  db: Database,
  jobIds: string[],
): Promise<Map<string, { total: number; active: number }>> {
  const counts = new Map<string, { total: number; active: number }>();
  if (jobIds.length === 0) return counts;
  const rows = await db
    .select({ jobId: candidates.jobId, stage: candidates.stage })
    .from(candidates)
    .where(inArray(candidates.jobId, jobIds));
  for (const r of rows) {
    const entry = counts.get(r.jobId) ?? { total: 0, active: 0 };
    entry.total += 1;
    if ((ACTIVE_STAGES as readonly string[]).includes(r.stage)) entry.active += 1;
    counts.set(r.jobId, entry);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Job requisitions
// ---------------------------------------------------------------------------

export async function listJobs(
  db: Database,
  query: ListJobsQuery,
  actor: RecruitingActor,
): Promise<Paginated<JobRequisition>> {
  const filters = [];
  if (query.status) filters.push(eq(jobRequisitions.status, query.status));
  if (query.department) filters.push(eq(jobRequisitions.department, query.department));
  if (query.search) {
    filters.push(sql`${jobRequisitions.title} like ${`%${escapeLike(query.search)}%`} escape '\\'`);
  }
  if (!canManage(actor.roles)) {
    filters.push(eq(jobRequisitions.hiringManagerId, actor.employeeId));
  }
  const where = filters.length ? and(...filters) : undefined;

  const sortColumn = {
    createdAt: jobRequisitions.createdAt,
    title: jobRequisitions.title,
    department: jobRequisitions.department,
    status: jobRequisitions.status,
  }[query.sort];
  const direction = query.order === 'asc' ? sortColumn : desc(sortColumn);

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(jobRequisitions)
    .where(where);

  const rows = await db
    .select()
    .from(jobRequisitions)
    .where(where)
    .orderBy(direction)
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const counts = await candidateCounts(db, rows.map((r) => r.id));
  const data = rows.map((row) => {
    const c = counts.get(row.id);
    return toJob(row, { candidateCount: c?.total ?? 0, activeCandidateCount: c?.active ?? 0 });
  });

  return {
    data,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

async function loadJob(db: Database, id: string): Promise<JobRow> {
  const [row] = await db.select().from(jobRequisitions).where(eq(jobRequisitions.id, id)).limit(1);
  if (!row) throw NotFound('Job requisition not found');
  return row;
}

export async function getJob(
  db: Database,
  id: string,
  actor: RecruitingActor,
): Promise<JobRequisition> {
  const row = await loadJob(db, id);
  assertJobVisible(row, actor);
  const counts = await candidateCounts(db, [id]);
  const c = counts.get(id);
  return toJob(row, { candidateCount: c?.total ?? 0, activeCandidateCount: c?.active ?? 0 });
}

export async function createJob(
  db: Database,
  recruiterId: string,
  input: CreateJobInput,
): Promise<JobRequisition> {
  if (input.hiringManagerId) {
    const [mgr] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, input.hiringManagerId))
      .limit(1);
    if (!mgr) throw BadRequest('Hiring manager not found');
  }
  const id = createId('job');
  await db.insert(jobRequisitions).values({
    id,
    title: input.title,
    department: input.department,
    division: input.division ?? null,
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
  return getJob(db, id, { employeeId: recruiterId, roles: ['recruiter'] });
}

export async function updateJob(
  db: Database,
  id: string,
  input: UpdateJobInput,
  actor: RecruitingActor,
): Promise<JobRequisition> {
  const row = await loadJob(db, id);
  if (row.status === 'closed' || row.status === 'filled') {
    throw BadRequest('A closed or filled requisition can no longer be edited');
  }
  if (input.openings !== undefined && input.openings < row.filledCount) {
    throw BadRequest(`Openings cannot be fewer than the ${row.filledCount} already filled`);
  }
  if (input.hiringManagerId) {
    const [mgr] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, input.hiringManagerId))
      .limit(1);
    if (!mgr) throw BadRequest('Hiring manager not found');
  }
  const salaryMinCents =
    input.salaryMinCents === undefined ? row.salaryMinCents : input.salaryMinCents;
  const salaryMaxCents =
    input.salaryMaxCents === undefined ? row.salaryMaxCents : input.salaryMaxCents;
  if (salaryMinCents !== null && salaryMaxCents !== null && salaryMaxCents < salaryMinCents) {
    throw BadRequest('Maximum salary must be greater than or equal to minimum salary');
  }
  await db
    .update(jobRequisitions)
    .set({
      title: input.title ?? row.title,
      department: input.department ?? row.department,
      division: input.division === undefined ? row.division : input.division,
      location: input.location ?? row.location,
      employmentType: input.employmentType ?? row.employmentType,
      description: input.description ?? row.description,
      hiringManagerId:
        input.hiringManagerId === undefined ? row.hiringManagerId : input.hiringManagerId,
      recruiterId: input.recruiterId === undefined ? row.recruiterId : input.recruiterId,
      openings: input.openings ?? row.openings,
      salaryMinCents,
      salaryMaxCents,
      updatedAt: nowIso(),
    })
    .where(eq(jobRequisitions.id, id));
  return getJob(db, id, actor);
}

/** Approve a draft requisition to post it publicly (HR-gated). */
export async function approveJob(
  db: Database,
  id: string,
  approverId: string,
  actor: RecruitingActor,
): Promise<JobRequisition> {
  const row = await loadJob(db, id);
  if (row.status !== 'draft') {
    throw BadRequest('Only a draft requisition can be approved to post');
  }
  await db
    .update(jobRequisitions)
    .set({
      status: 'open',
      approvedById: approverId,
      approvedAt: nowIso(),
      postedDate: row.postedDate ?? isoToday(),
      updatedAt: nowIso(),
    })
    .where(eq(jobRequisitions.id, id));
  return getJob(db, id, actor);
}

export async function changeJobStatus(
  db: Database,
  id: string,
  input: JobStatusActionInput,
  actor: RecruitingActor,
): Promise<JobRequisition> {
  const row = await loadJob(db, id);
  const allowed = JOB_STATUS_TRANSITIONS[row.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw BadRequest(`Cannot move a ${row.status} requisition to ${input.status}`);
  }
  await db
    .update(jobRequisitions)
    .set({
      status: input.status,
      closedAt: input.status === 'closed' ? nowIso() : row.closedAt,
      updatedAt: nowIso(),
    })
    .where(eq(jobRequisitions.id, id));
  return getJob(db, id, actor);
}

// ---------------------------------------------------------------------------
// Candidates & pipeline
// ---------------------------------------------------------------------------

export async function listCandidates(
  db: Database,
  jobId: string,
  actor: RecruitingActor,
): Promise<Candidate[]> {
  const job = await loadJob(db, jobId);
  assertJobVisible(job, actor);
  const rows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.jobId, jobId))
    .orderBy(desc(candidates.appliedAt));
  return rows.map(toCandidate);
}

async function loadCandidate(db: Database, id: string): Promise<CandidateRow> {
  const [row] = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1);
  if (!row) throw NotFound('Candidate not found');
  return row;
}

export async function createCandidate(
  db: Database,
  input: CreateCandidateInput,
  actor: RecruitingActor,
): Promise<Candidate> {
  const job = await loadJob(db, input.jobId);
  if (job.status === 'draft') {
    throw BadRequest('Approve the requisition to post before adding candidates');
  }
  if (job.status === 'closed' || job.status === 'filled') {
    throw BadRequest('Cannot apply to a closed or filled requisition');
  }
  const email = input.email.toLowerCase();
  const [existing] = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(and(eq(candidates.jobId, input.jobId), eq(candidates.email, email)))
    .limit(1);
  if (existing) throw Conflict('This candidate has already applied to this requisition');

  const id = createId('cand');
  await db.insert(candidates).values({
    id,
    jobId: input.jobId,
    firstName: input.firstName,
    lastName: input.lastName,
    email,
    phone: input.phone ?? null,
    source: input.source ?? null,
    resumeUrl: input.resumeUrl ?? null,
    notes: input.notes ?? null,
    stage: 'applied',
  });
  await db.insert(candidateStageEvents).values({
    id: createId('cse'),
    candidateId: id,
    fromStage: null,
    toStage: 'applied',
    note: 'Application received',
    changedById: actor.employeeId,
  });
  return toCandidate(await loadCandidate(db, id));
}

export async function updateCandidate(
  db: Database,
  id: string,
  input: UpdateCandidateInput,
  actor: RecruitingActor,
): Promise<Candidate> {
  const row = await loadCandidate(db, id);
  await assertCandidateVisible(db, row, actor);
  await db
    .update(candidates)
    .set({
      firstName: input.firstName ?? row.firstName,
      lastName: input.lastName ?? row.lastName,
      phone: input.phone === undefined ? row.phone : input.phone,
      source: input.source === undefined ? row.source : input.source,
      resumeUrl: input.resumeUrl === undefined ? row.resumeUrl : input.resumeUrl,
      rating: input.rating === undefined ? row.rating : input.rating,
      notes: input.notes === undefined ? row.notes : input.notes,
      updatedAt: nowIso(),
    })
    .where(eq(candidates.id, id));
  return toCandidate(await loadCandidate(db, id));
}

export async function moveCandidateStage(
  db: Database,
  id: string,
  input: MoveCandidateStageInput,
  actor: RecruitingActor,
): Promise<Candidate> {
  const row = await loadCandidate(db, id);
  const from = row.stage;
  const to = input.stage;
  if (from === to) return toCandidate(row);
  if ((TERMINAL_STAGES as readonly string[]).includes(from)) {
    throw BadRequest(`A ${from} candidate can no longer move stages`);
  }
  const allowed = STAGE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw BadRequest(`Cannot move a candidate from ${from} to ${to}`);
  }

  if (to === 'hired') {
    await assertHireable(db, row);
  }

  await db
    .update(candidates)
    .set({ stage: to, updatedAt: nowIso() })
    .where(eq(candidates.id, id));
  await db.insert(candidateStageEvents).values({
    id: createId('cse'),
    candidateId: id,
    fromStage: from,
    toStage: to,
    note: input.note ?? null,
    changedById: actor.employeeId,
  });

  if (to === 'hired') await fillOpening(db, row.jobId);

  return toCandidate(await loadCandidate(db, id));
}

/** A candidate may only be hired with an accepted offer and a remaining opening. */
async function assertHireable(db: Database, candidate: CandidateRow): Promise<void> {
  const [offer] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.candidateId, candidate.id), eq(offers.status, 'accepted')))
    .limit(1);
  if (!offer) throw BadRequest('Candidate must have an accepted offer before being hired');
  const job = await loadJob(db, candidate.jobId);
  if (job.filledCount >= job.openings) {
    throw Conflict('All openings for this requisition are already filled');
  }
}

/** Atomically claim an opening, auto-filling the requisition when none remain. */
async function fillOpening(db: Database, jobId: string): Promise<void> {
  await db
    .update(jobRequisitions)
    .set({ filledCount: sql`${jobRequisitions.filledCount} + 1`, updatedAt: nowIso() })
    .where(eq(jobRequisitions.id, jobId));
  const job = await loadJob(db, jobId);
  if (job.filledCount >= job.openings) {
    await db
      .update(jobRequisitions)
      .set({ status: 'filled', closedAt: nowIso(), updatedAt: nowIso() })
      .where(eq(jobRequisitions.id, jobId));
  }
}

export async function getCandidateDetail(
  db: Database,
  id: string,
  actor: RecruitingActor,
): Promise<CandidateDetail> {
  const row = await loadCandidate(db, id);
  const job = await loadJob(db, row.jobId);
  assertJobVisible(job, actor);

  const [historyRows, interviewRows, scorecardRows, offerRows] = await Promise.all([
    db
      .select()
      .from(candidateStageEvents)
      .where(eq(candidateStageEvents.candidateId, id))
      .orderBy(desc(candidateStageEvents.createdAt)),
    db
      .select()
      .from(interviews)
      .where(eq(interviews.candidateId, id))
      .orderBy(desc(interviews.scheduledAt)),
    db.select().from(interviewScorecards).where(eq(interviewScorecards.candidateId, id)),
    db
      .select()
      .from(offers)
      .where(eq(offers.candidateId, id))
      .orderBy(desc(offers.createdAt))
      .limit(1),
  ]);

  const personIds = [
    ...new Set([
      ...historyRows.map((h) => h.changedById),
      ...interviewRows.map((i) => i.interviewerId),
      ...scorecardRows.map((s) => s.interviewerId),
    ].filter((v): v is string => Boolean(v))),
  ];
  const people = await loadNames(db, personIds);
  const scorecardByInterview = new Map(
    scorecardRows.map((s) => [s.interviewId, toScorecard(s, people.get(s.interviewerId))]),
  );

  return {
    ...toCandidate(row),
    job: { id: job.id, title: job.title, department: job.department, status: job.status as JobRequisition['status'] },
    stageHistory: historyRows.map((h) => toStageEvent(h, h.changedById ? people.get(h.changedById) : null)),
    interviews: interviewRows.map((i) =>
      toInterview(i, {
        interviewerName: people.get(i.interviewerId),
        scorecard: scorecardByInterview.get(i.id) ?? null,
      }),
    ),
    offer: offerRows[0] ? toOffer(offerRows[0]) : null,
  };
}

async function loadNames(db: Database, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
    .from(employees)
    .where(inArray(employees.id, ids));
  return new Map(rows.map((r) => [r.id, displayName(r.firstName, r.lastName)]));
}

// ---------------------------------------------------------------------------
// Interviews & scorecards
// ---------------------------------------------------------------------------

export async function scheduleInterview(
  db: Database,
  input: ScheduleInterviewInput,
  actor: RecruitingActor,
): Promise<Interview> {
  const candidate = await loadCandidate(db, input.candidateId);
  await assertCandidateVisible(db, candidate, actor);
  if ((TERMINAL_STAGES as readonly string[]).includes(candidate.stage)) {
    throw BadRequest('Cannot schedule an interview for a hired or rejected candidate');
  }
  const [interviewer] = await db
    .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName })
    .from(employees)
    .where(eq(employees.id, input.interviewerId))
    .limit(1);
  if (!interviewer) throw BadRequest('Interviewer not found');

  const id = createId('intv');
  await db.insert(interviews).values({
    id,
    candidateId: candidate.id,
    jobId: candidate.jobId,
    interviewerId: input.interviewerId,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes,
    mode: input.mode,
    stage: candidate.stage,
    location: input.location ?? null,
    status: 'scheduled',
  });
  const [row] = await db.select().from(interviews).where(eq(interviews.id, id)).limit(1);
  return toInterview(row!, {
    interviewerName: displayName(interviewer.firstName, interviewer.lastName),
  });
}

export async function updateInterview(
  db: Database,
  id: string,
  input: UpdateInterviewInput,
  actor: RecruitingActor,
): Promise<Interview> {
  const [row] = await db.select().from(interviews).where(eq(interviews.id, id)).limit(1);
  if (!row) throw NotFound('Interview not found');
  await assertCandidateVisible(db, await loadCandidate(db, row.candidateId), actor);
  if (row.status !== 'scheduled' && (input.scheduledAt || input.interviewerId)) {
    throw BadRequest('Only a scheduled interview can be rescheduled');
  }
  if (input.interviewerId) {
    const [interviewer] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, input.interviewerId))
      .limit(1);
    if (!interviewer) throw BadRequest('Interviewer not found');
  }
  await db
    .update(interviews)
    .set({
      interviewerId: input.interviewerId ?? row.interviewerId,
      scheduledAt: input.scheduledAt ?? row.scheduledAt,
      durationMinutes: input.durationMinutes ?? row.durationMinutes,
      mode: input.mode ?? row.mode,
      location: input.location === undefined ? row.location : input.location,
      status: input.status ?? row.status,
      updatedAt: nowIso(),
    })
    .where(eq(interviews.id, id));
  const [updated] = await db.select().from(interviews).where(eq(interviews.id, id)).limit(1);
  const name = await loadNames(db, [updated!.interviewerId]);
  return toInterview(updated!, { interviewerName: name.get(updated!.interviewerId) });
}

export async function submitScorecard(
  db: Database,
  interviewId: string,
  input: SubmitScorecardInput,
  actor: RecruitingActor,
): Promise<Scorecard> {
  const [interview] = await db
    .select()
    .from(interviews)
    .where(eq(interviews.id, interviewId))
    .limit(1);
  if (!interview) throw NotFound('Interview not found');
  await assertCandidateVisible(db, await loadCandidate(db, interview.candidateId), actor);
  const [existing] = await db
    .select({ id: interviewScorecards.id })
    .from(interviewScorecards)
    .where(eq(interviewScorecards.interviewId, interviewId))
    .limit(1);
  if (existing) throw Conflict('A scorecard has already been submitted for this interview');

  const interviewerId = interview.interviewerId;
  const id = createId('scr');
  await db.insert(interviewScorecards).values({
    id,
    interviewId,
    candidateId: interview.candidateId,
    interviewerId,
    rating: input.rating,
    recommendation: input.recommendation,
    strengths: input.strengths ?? null,
    concerns: input.concerns ?? null,
    comments: input.comments ?? null,
  });
  await db
    .update(interviews)
    .set({ status: 'completed', updatedAt: nowIso() })
    .where(eq(interviews.id, interviewId));
  const [row] = await db
    .select()
    .from(interviewScorecards)
    .where(eq(interviewScorecards.id, id))
    .limit(1);
  const name = await loadNames(db, [interviewerId]);
  return toScorecard(row!, name.get(interviewerId));
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

const OPEN_OFFER_STATUSES = ['draft', 'extended', 'accepted'] as const;

export async function createOffer(
  db: Database,
  input: CreateOfferInput,
  extendedById: string,
  actor: RecruitingActor,
): Promise<Offer> {
  const candidate = await loadCandidate(db, input.candidateId);
  await assertCandidateVisible(db, candidate, actor);
  if (candidate.stage !== 'offer') {
    throw BadRequest('Candidate must be in the offer stage before an offer is drafted');
  }
  const [existing] = await db
    .select({ id: offers.id })
    .from(offers)
    .where(
      and(
        eq(offers.candidateId, input.candidateId),
        inArray(offers.status, [...OPEN_OFFER_STATUSES]),
      ),
    )
    .limit(1);
  if (existing) throw Conflict('An active offer already exists for this candidate');

  const id = createId('ofr');
  await db.insert(offers).values({
    id,
    candidateId: candidate.id,
    jobId: candidate.jobId,
    salaryCents: input.salaryCents,
    startDate: input.startDate,
    expiresAt: input.expiresAt ?? null,
    notes: input.notes ?? null,
    extendedById,
    status: 'draft',
  });
  const [row] = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
  return toOffer(row!);
}

export async function updateOffer(
  db: Database,
  id: string,
  input: UpdateOfferInput,
  actor: RecruitingActor,
): Promise<Offer> {
  const [row] = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
  if (!row) throw NotFound('Offer not found');
  await assertCandidateVisible(db, await loadCandidate(db, row.candidateId), actor);
  if (row.status !== 'draft') throw BadRequest('Only a draft offer can be edited');
  await db
    .update(offers)
    .set({
      salaryCents: input.salaryCents ?? row.salaryCents,
      startDate: input.startDate ?? row.startDate,
      expiresAt: input.expiresAt === undefined ? row.expiresAt : input.expiresAt,
      notes: input.notes === undefined ? row.notes : input.notes,
      updatedAt: nowIso(),
    })
    .where(eq(offers.id, id));
  const [updated] = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
  return toOffer(updated!);
}

const OFFER_ACTION_TRANSITIONS: Record<
  OfferActionInput['action'],
  { from: readonly string[]; to: string }
> = {
  extend: { from: ['draft'], to: 'extended' },
  accept: { from: ['extended'], to: 'accepted' },
  decline: { from: ['extended'], to: 'declined' },
  rescind: { from: ['draft', 'extended'], to: 'rescinded' },
};

export async function actOnOffer(
  db: Database,
  id: string,
  input: OfferActionInput,
  actor: RecruitingActor,
): Promise<Offer> {
  const [row] = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
  if (!row) throw NotFound('Offer not found');
  await assertCandidateVisible(db, await loadCandidate(db, row.candidateId), actor);
  const transition = OFFER_ACTION_TRANSITIONS[input.action];
  if (!transition.from.includes(row.status)) {
    throw BadRequest(`Cannot ${input.action} an offer that is ${row.status}`);
  }
  const decided = ['accepted', 'declined', 'rescinded'].includes(transition.to);
  await db
    .update(offers)
    .set({
      status: transition.to,
      decidedAt: decided ? nowIso() : row.decidedAt,
      updatedAt: nowIso(),
    })
    .where(eq(offers.id, id));
  const [updated] = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
  return toOffer(updated!);
}

// ---------------------------------------------------------------------------
// Directory lookups (for assigning interviewers / hiring managers)
// ---------------------------------------------------------------------------

export interface RecruitingPerson {
  id: string;
  name: string;
  department: string;
  title: string;
}

export async function listAssignableEmployees(db: Database): Promise<RecruitingPerson[]> {
  const rows = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      department: employees.department,
      title: employees.jobTitle,
      status: employees.status,
    })
    .from(employees)
    .orderBy(employees.firstName);
  return rows
    .filter((r) => r.status !== 'terminated')
    .map((r) => ({
      id: r.id,
      name: displayName(r.firstName, r.lastName),
      department: r.department,
      title: r.title,
    }));
}

// ---------------------------------------------------------------------------
// Pipeline summary
// ---------------------------------------------------------------------------

export async function pipelineSummary(
  db: Database,
  actor: RecruitingActor,
): Promise<{ stage: string; count: number }[]> {
  const jobFilter = canManage(actor.roles)
    ? undefined
    : eq(jobRequisitions.hiringManagerId, actor.employeeId);
  const rows = await db
    .select({ stage: candidates.stage })
    .from(candidates)
    .innerJoin(jobRequisitions, eq(candidates.jobId, jobRequisitions.id))
    .where(jobFilter);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.stage, (map.get(r.stage) ?? 0) + 1);
  return [...map.entries()].map(([stage, count]) => ({ stage, count }));
}
