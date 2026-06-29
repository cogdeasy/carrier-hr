import { and, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import type {
  CreateActionItemInput,
  CreateGoalInput,
  CreateOneOnOneInput,
  CreateReviewCycleInput,
  EnrollReviewCycleInput,
  Goal,
  GoalQuery,
  OneOnOne,
  Review,
  ReviewCycle,
  SubmitManagerReviewInput,
  SubmitSelfReviewInput,
  UpdateActionItemInput,
  UpdateGoalInput,
  UpdateOneOnOneInput,
  UpdateReviewCycleInput,
} from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import {
  employees,
  goals,
  oneOnOneActionItems,
  oneOnOnes,
  reviewCycles,
  reviews,
} from '../db/schema.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { nowIso } from '../lib/dates.js';
import {
  toEmployeeRef,
  toGoal,
  toOneOnOne,
  toOneOnOneActionItem,
  toReview,
  toReviewCycle,
} from './mappers.js';
import { createNotification } from './notification.service.js';

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export async function listGoals(
  db: Database,
  employeeIds: string | string[] | null,
  filters: Pick<GoalQuery, 'cycleId' | 'status'> = {},
): Promise<Goal[]> {
  const where: SQL[] = [];
  // `null` means "every employee" (admin org-wide view); an empty array means
  // "no one matched" and yields no goals.
  if (employeeIds !== null) {
    const ids = Array.isArray(employeeIds) ? employeeIds : [employeeIds];
    if (ids.length === 0) return [];
    where.push(inArray(goals.employeeId, ids));
  }
  if (filters.cycleId) where.push(eq(goals.cycleId, filters.cycleId));
  if (filters.status) where.push(eq(goals.status, filters.status));
  const rows = await db
    .select()
    .from(goals)
    .where(and(...where))
    .orderBy(desc(goals.updatedAt));
  return rows.map(toGoal);
}

async function assertCycleExists(db: Database, cycleId: string): Promise<void> {
  const [row] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1);
  if (!row) throw BadRequest('Review cycle not found');
}

export async function createGoal(
  db: Database,
  employeeId: string,
  input: CreateGoalInput,
): Promise<Goal> {
  if (input.cycleId) await assertCycleExists(db, input.cycleId);
  const id = createId('goal');
  await db.insert(goals).values({
    id,
    employeeId,
    cycleId: input.cycleId ?? null,
    title: input.title,
    description: input.description ?? null,
    dueDate: input.dueDate ?? null,
    status: 'active',
    progress: 0,
  });
  const [row] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
  return toGoal(row!);
}

export async function updateGoal(
  db: Database,
  employeeId: string,
  id: string,
  input: UpdateGoalInput,
): Promise<Goal> {
  const [row] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
  if (!row) throw NotFound('Goal not found');
  if (row.employeeId !== employeeId) throw Forbidden('You can only edit your own goals');
  if (input.cycleId) await assertCycleExists(db, input.cycleId);
  let progress = input.progress ?? row.progress;
  let status = input.status ?? row.status;
  if (input.status === 'completed') {
    progress = 100;
  } else if (input.status === undefined && progress >= 100 && (status === 'active' || status === 'at_risk')) {
    // Hitting 100% auto-completes an in-flight goal, but an explicit status
    // choice always wins so users can reopen or re-scope a finished goal.
    status = 'completed';
  }
  await db
    .update(goals)
    .set({
      title: input.title ?? row.title,
      description: input.description === undefined ? row.description : input.description,
      cycleId: input.cycleId === undefined ? row.cycleId : input.cycleId,
      status,
      progress,
      dueDate: input.dueDate === undefined ? row.dueDate : input.dueDate,
      updatedAt: nowIso(),
    })
    .where(eq(goals.id, id));
  const [updated] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
  return toGoal(updated!);
}

export async function deleteGoal(db: Database, employeeId: string, id: string): Promise<void> {
  const [row] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
  if (!row) throw NotFound('Goal not found');
  if (row.employeeId !== employeeId) throw Forbidden('You can only delete your own goals');
  await db.delete(goals).where(eq(goals.id, id));
}

// ---------------------------------------------------------------------------
// Review cycles
// ---------------------------------------------------------------------------

export async function listCycles(db: Database): Promise<ReviewCycle[]> {
  const cycleRows = await db.select().from(reviewCycles).orderBy(desc(reviewCycles.startDate));
  if (cycleRows.length === 0) return [];
  const reviewRows = await db
    .select({ cycleId: reviews.cycleId, status: reviews.status })
    .from(reviews)
    .where(
      inArray(
        reviews.cycleId,
        cycleRows.map((c) => c.id),
      ),
    );
  const counts = new Map<string, { total: number; completed: number }>();
  for (const r of reviewRows) {
    const c = counts.get(r.cycleId) ?? { total: 0, completed: 0 };
    c.total += 1;
    if (r.status === 'completed') c.completed += 1;
    counts.set(r.cycleId, c);
  }
  return cycleRows.map((c) => ({
    ...toReviewCycle(c),
    reviewCount: counts.get(c.id)?.total ?? 0,
    completedCount: counts.get(c.id)?.completed ?? 0,
  }));
}

export async function createReviewCycle(
  db: Database,
  input: CreateReviewCycleInput,
): Promise<ReviewCycle> {
  const id = createId('cyc');
  await db.insert(reviewCycles).values({
    id,
    name: input.name,
    status: input.status ?? 'upcoming',
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const [row] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, id)).limit(1);
  return toReviewCycle(row!);
}

export async function updateReviewCycle(
  db: Database,
  id: string,
  input: UpdateReviewCycleInput,
): Promise<ReviewCycle> {
  const [row] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, id)).limit(1);
  if (!row) throw NotFound('Review cycle not found');
  if (row.status === 'closed' && input.status && input.status !== 'closed') {
    throw BadRequest('A closed review cycle cannot be reopened');
  }
  const startDate = input.startDate ?? row.startDate;
  const endDate = input.endDate ?? row.endDate;
  if (startDate > endDate) throw BadRequest('startDate must be on or before endDate');
  await db
    .update(reviewCycles)
    .set({
      name: input.name ?? row.name,
      status: input.status ?? row.status,
      startDate,
      endDate,
    })
    .where(eq(reviewCycles.id, id));
  const [updated] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, id)).limit(1);
  return toReviewCycle(updated!);
}

export async function enrollCycle(
  db: Database,
  cycleId: string,
  input: EnrollReviewCycleInput,
): Promise<{ enrolled: number; skipped: number }> {
  const [cycle] = await db.select().from(reviewCycles).where(eq(reviewCycles.id, cycleId)).limit(1);
  if (!cycle) throw NotFound('Review cycle not found');
  if (cycle.status === 'closed') throw BadRequest('Cannot enrol into a closed cycle');

  const where = [eq(employees.status, 'active')];
  if (input.employeeIds && input.employeeIds.length > 0) {
    where.push(inArray(employees.id, input.employeeIds));
  } else if (!input.allWithManager) {
    throw BadRequest('Provide employeeIds or set allWithManager');
  }
  const candidates = await db
    .select({ id: employees.id, managerId: employees.managerId })
    .from(employees)
    .where(and(...where));

  const existing = await db
    .select({ employeeId: reviews.employeeId })
    .from(reviews)
    .where(eq(reviews.cycleId, cycleId));
  const already = new Set(existing.map((r) => r.employeeId));

  let enrolled = 0;
  let skipped = 0;
  for (const c of candidates) {
    if (!c.managerId || already.has(c.id)) {
      skipped += 1;
      continue;
    }
    await db.insert(reviews).values({
      id: createId('rev'),
      cycleId,
      employeeId: c.id,
      reviewerId: c.managerId,
      status: 'self_review',
    });
    await createNotification(db, {
      employeeId: c.id,
      type: 'review_assigned',
      title: 'Performance review opened',
      body: `You have been enrolled in "${cycle.name}". Complete your self-assessment.`,
      link: '/performance?tab=reviews',
    });
    enrolled += 1;
    already.add(c.id);
  }
  return { enrolled, skipped };
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export async function listReviews(
  db: Database,
  params: { employeeId?: string; reviewerId?: string; scopeEmployeeIds?: string[]; cycleId?: string },
): Promise<Review[]> {
  const filters = [];
  if (params.employeeId) filters.push(eq(reviews.employeeId, params.employeeId));
  if (params.reviewerId) filters.push(eq(reviews.reviewerId, params.reviewerId));
  if (params.cycleId) filters.push(eq(reviews.cycleId, params.cycleId));
  if (params.scopeEmployeeIds) {
    if (params.scopeEmployeeIds.length === 0) return [];
    filters.push(inArray(reviews.employeeId, params.scopeEmployeeIds));
  }
  const rows = await db
    .select()
    .from(reviews)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(reviews.updatedAt));
  if (rows.length === 0) return [];

  // Hydrate the cycle name + employee/reviewer refs the performance UI renders,
  // batch-fetching all referenced cycles and people in one query each.
  const cycleIds = [...new Set(rows.map((r) => r.cycleId))];
  const personIds = [...new Set(rows.flatMap((r) => [r.employeeId, r.reviewerId]))];
  const [cycleRows, personRows] = await Promise.all([
    db.select().from(reviewCycles).where(inArray(reviewCycles.id, cycleIds)),
    db.select().from(employees).where(inArray(employees.id, personIds)),
  ]);
  const cycles = new Map(cycleRows.map((c) => [c.id, toReviewCycle(c)]));
  const people = new Map(personRows.map((p) => [p.id, toEmployeeRef(p)]));
  return rows.map((r) =>
    toReview(r, {
      cycle: cycles.get(r.cycleId),
      employee: people.get(r.employeeId),
      reviewer: people.get(r.reviewerId),
    }),
  );
}

export async function getReview(db: Database, id: string): Promise<Review> {
  const [row] = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);
  if (!row) throw NotFound('Review not found');
  const [cycleRows, personRows] = await Promise.all([
    db.select().from(reviewCycles).where(eq(reviewCycles.id, row.cycleId)),
    db.select().from(employees).where(inArray(employees.id, [row.employeeId, row.reviewerId])),
  ]);
  const people = new Map(personRows.map((p) => [p.id, toEmployeeRef(p)]));
  return toReview(row, {
    cycle: cycleRows[0] ? toReviewCycle(cycleRows[0]) : undefined,
    employee: people.get(row.employeeId),
    reviewer: people.get(row.reviewerId),
  });
}

export async function submitSelfReview(
  db: Database,
  employeeId: string,
  id: string,
  input: SubmitSelfReviewInput,
): Promise<Review> {
  const [row] = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);
  if (!row) throw NotFound('Review not found');
  if (row.employeeId !== employeeId) throw Forbidden('This is not your review');
  // A self-assessment may only be (re)submitted while the review is still in an
  // employee-owned stage. Once it has advanced to manager review or completed,
  // re-submitting would silently regress a finalized review.
  if (row.status !== 'not_started' && row.status !== 'self_review') {
    throw BadRequest('Self-assessment can no longer be submitted for this review');
  }
  await db
    .update(reviews)
    .set({ selfAssessment: input.selfAssessment, status: 'manager_review', updatedAt: nowIso() })
    .where(eq(reviews.id, id));
  await createNotification(db, {
    employeeId: row.reviewerId,
    type: 'review_assigned',
    title: 'Self-assessment submitted',
    body: 'A direct report has completed their self-assessment for review.',
    link: '/performance?tab=reviews',
  });
  return getReview(db, id);
}

export async function submitManagerReview(
  db: Database,
  reviewerId: string,
  id: string,
  input: SubmitManagerReviewInput,
): Promise<Review> {
  const [row] = await db.select().from(reviews).where(eq(reviews.id, id)).limit(1);
  if (!row) throw NotFound('Review not found');
  if (row.reviewerId !== reviewerId) throw Forbidden('You are not the reviewer');
  if (!row.selfAssessment) throw BadRequest('Employee has not submitted a self-assessment yet');
  // Only a review awaiting manager feedback may be finalized; this also blocks
  // overwriting a completed review, which is immutable.
  if (row.status !== 'manager_review') {
    throw BadRequest('This review is not awaiting manager feedback');
  }
  await db
    .update(reviews)
    .set({
      managerAssessment: input.managerAssessment,
      overallRating: input.overallRating,
      status: 'completed',
      submittedAt: nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(reviews.id, id));
  await createNotification(db, {
    employeeId: row.employeeId,
    type: 'review_assigned',
    title: 'Performance review completed',
    body: 'Your manager has completed your performance review.',
    link: '/performance?tab=reviews',
  });
  return getReview(db, id);
}

// ---------------------------------------------------------------------------
// 1:1 meetings
// ---------------------------------------------------------------------------

async function hydrateOneOnOnes(
  db: Database,
  rows: (typeof oneOnOnes.$inferSelect)[],
): Promise<OneOnOne[]> {
  if (rows.length === 0) return [];
  const personIds = [...new Set(rows.flatMap((r) => [r.managerId, r.employeeId]))];
  const meetingIds = rows.map((r) => r.id);
  const [personRows, itemRows] = await Promise.all([
    db.select().from(employees).where(inArray(employees.id, personIds)),
    db
      .select()
      .from(oneOnOneActionItems)
      .where(inArray(oneOnOneActionItems.oneOnOneId, meetingIds))
      .orderBy(oneOnOneActionItems.createdAt),
  ]);
  const people = new Map(personRows.map((p) => [p.id, toEmployeeRef(p)]));
  const itemsByMeeting = new Map<string, ReturnType<typeof toOneOnOneActionItem>[]>();
  for (const item of itemRows) {
    const list = itemsByMeeting.get(item.oneOnOneId) ?? [];
    list.push(toOneOnOneActionItem(item));
    itemsByMeeting.set(item.oneOnOneId, list);
  }
  return rows.map((r) =>
    toOneOnOne(r, {
      manager: people.get(r.managerId),
      employee: people.get(r.employeeId),
      actionItems: itemsByMeeting.get(r.id) ?? [],
    }),
  );
}

export async function listOneOnOnes(db: Database, employeeId: string): Promise<OneOnOne[]> {
  const rows = await db
    .select()
    .from(oneOnOnes)
    .where(or(eq(oneOnOnes.managerId, employeeId), eq(oneOnOnes.employeeId, employeeId)))
    .orderBy(desc(oneOnOnes.scheduledFor));
  return hydrateOneOnOnes(db, rows);
}

async function getMeetingRow(db: Database, id: string): Promise<typeof oneOnOnes.$inferSelect> {
  const [row] = await db.select().from(oneOnOnes).where(eq(oneOnOnes.id, id)).limit(1);
  if (!row) throw NotFound('1:1 meeting not found');
  return row;
}

function assertParticipant(
  row: typeof oneOnOnes.$inferSelect,
  viewer: { employeeId: string; isAdmin?: boolean },
): void {
  if (viewer.isAdmin) return;
  if (row.managerId !== viewer.employeeId && row.employeeId !== viewer.employeeId) {
    throw Forbidden('You do not have access to this meeting');
  }
}

export async function getOneOnOne(
  db: Database,
  id: string,
  viewer: { employeeId: string; isAdmin?: boolean },
): Promise<OneOnOne> {
  const row = await getMeetingRow(db, id);
  assertParticipant(row, viewer);
  const [hydrated] = await hydrateOneOnOnes(db, [row]);
  return hydrated!;
}

export async function createOneOnOne(
  db: Database,
  managerId: string,
  input: CreateOneOnOneInput,
): Promise<OneOnOne> {
  if (input.employeeId === managerId) {
    throw BadRequest('You cannot schedule a 1:1 with yourself');
  }
  const [report] = await db
    .select({ id: employees.id, managerId: employees.managerId })
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);
  if (!report) throw NotFound('Employee not found');
  if (report.managerId !== managerId) {
    throw Forbidden('You can only schedule 1:1s with your direct reports');
  }
  const id = createId('oneon');
  await db.insert(oneOnOnes).values({
    id,
    managerId,
    employeeId: input.employeeId,
    scheduledFor: input.scheduledFor,
    agenda: input.agenda ?? null,
  });
  await createNotification(db, {
    employeeId: input.employeeId,
    type: 'review_assigned',
    title: '1:1 scheduled',
    body: 'Your manager has scheduled a 1:1 with you.',
    link: '/performance?tab=oneOnOnes',
  });
  const [hydrated] = await hydrateOneOnOnes(db, [await getMeetingRow(db, id)]);
  return hydrated!;
}

export async function updateOneOnOne(
  db: Database,
  viewer: { employeeId: string; isAdmin?: boolean },
  id: string,
  input: UpdateOneOnOneInput,
): Promise<OneOnOne> {
  const row = await getMeetingRow(db, id);
  assertParticipant(row, viewer);
  // Rescheduling and closing out a meeting belong to the manager who owns it;
  // either participant may collaborate on the shared agenda and notes.
  if ((input.scheduledFor !== undefined || input.completed !== undefined) && !viewer.isAdmin) {
    if (row.managerId !== viewer.employeeId) {
      throw Forbidden('Only the meeting organiser can reschedule or close the meeting');
    }
  }
  await db
    .update(oneOnOnes)
    .set({
      scheduledFor: input.scheduledFor ?? row.scheduledFor,
      agenda: input.agenda === undefined ? row.agenda : input.agenda,
      notes: input.notes === undefined ? row.notes : input.notes,
      completed: input.completed ?? row.completed,
    })
    .where(eq(oneOnOnes.id, id));
  const [hydrated] = await hydrateOneOnOnes(db, [await getMeetingRow(db, id)]);
  return hydrated!;
}

export async function deleteOneOnOne(
  db: Database,
  viewer: { employeeId: string; isAdmin?: boolean },
  id: string,
): Promise<void> {
  const row = await getMeetingRow(db, id);
  if (!viewer.isAdmin && row.managerId !== viewer.employeeId) {
    throw Forbidden('Only the meeting organiser can delete this meeting');
  }
  await db.delete(oneOnOnes).where(eq(oneOnOnes.id, id));
}

export async function addActionItem(
  db: Database,
  viewer: { employeeId: string; isAdmin?: boolean },
  oneOnOneId: string,
  input: CreateActionItemInput,
): Promise<OneOnOne> {
  const row = await getMeetingRow(db, oneOnOneId);
  assertParticipant(row, viewer);
  if (input.assigneeId && input.assigneeId !== row.managerId && input.assigneeId !== row.employeeId) {
    throw BadRequest('Action items can only be assigned to a meeting participant');
  }
  await db.insert(oneOnOneActionItems).values({
    id: createId('aitem'),
    oneOnOneId,
    title: input.title,
    assigneeId: input.assigneeId ?? null,
  });
  const [hydrated] = await hydrateOneOnOnes(db, [row]);
  return hydrated!;
}

export async function updateActionItem(
  db: Database,
  viewer: { employeeId: string; isAdmin?: boolean },
  itemId: string,
  input: UpdateActionItemInput,
): Promise<OneOnOne> {
  const [item] = await db
    .select()
    .from(oneOnOneActionItems)
    .where(eq(oneOnOneActionItems.id, itemId))
    .limit(1);
  if (!item) throw NotFound('Action item not found');
  const row = await getMeetingRow(db, item.oneOnOneId);
  assertParticipant(row, viewer);
  if (input.assigneeId && input.assigneeId !== row.managerId && input.assigneeId !== row.employeeId) {
    throw BadRequest('Action items can only be assigned to a meeting participant');
  }
  await db
    .update(oneOnOneActionItems)
    .set({
      title: input.title ?? item.title,
      completed: input.completed ?? item.completed,
      assigneeId: input.assigneeId === undefined ? item.assigneeId : input.assigneeId,
    })
    .where(eq(oneOnOneActionItems.id, itemId));
  const [hydrated] = await hydrateOneOnOnes(db, [row]);
  return hydrated!;
}

export async function deleteActionItem(
  db: Database,
  viewer: { employeeId: string; isAdmin?: boolean },
  itemId: string,
): Promise<OneOnOne> {
  const [item] = await db
    .select()
    .from(oneOnOneActionItems)
    .where(eq(oneOnOneActionItems.id, itemId))
    .limit(1);
  if (!item) throw NotFound('Action item not found');
  const row = await getMeetingRow(db, item.oneOnOneId);
  assertParticipant(row, viewer);
  await db.delete(oneOnOneActionItems).where(eq(oneOnOneActionItems.id, itemId));
  const [hydrated] = await hydrateOneOnOnes(db, [row]);
  return hydrated!;
}
