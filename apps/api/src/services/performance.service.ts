import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  CreateGoalInput,
  Goal,
  Review,
  ReviewCycle,
  SubmitManagerReviewInput,
  SubmitSelfReviewInput,
  UpdateGoalInput,
} from '@carrier-hr/shared';
import type { Database } from '../db/client.js';
import { employees, goals, reviewCycles, reviews } from '../db/schema.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { nowIso } from '../lib/dates.js';
import { toEmployeeRef, toGoal, toReview, toReviewCycle } from './mappers.js';
import { createNotification } from './notification.service.js';

export async function listGoals(db: Database, employeeId: string): Promise<Goal[]> {
  const rows = await db
    .select()
    .from(goals)
    .where(eq(goals.employeeId, employeeId))
    .orderBy(desc(goals.updatedAt));
  return rows.map(toGoal);
}

export async function createGoal(
  db: Database,
  employeeId: string,
  input: CreateGoalInput,
): Promise<Goal> {
  const id = createId('goal');
  await db.insert(goals).values({
    id,
    employeeId,
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
  await db
    .update(goals)
    .set({
      title: input.title ?? row.title,
      description: input.description === undefined ? row.description : input.description,
      status: input.status ?? row.status,
      progress: input.progress ?? row.progress,
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

export async function listCycles(db: Database): Promise<ReviewCycle[]> {
  const rows = await db.select().from(reviewCycles).orderBy(desc(reviewCycles.startDate));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status as ReviewCycle['status'],
    startDate: r.startDate,
    endDate: r.endDate,
    createdAt: r.createdAt,
  }));
}

export async function listReviews(
  db: Database,
  params: { employeeId?: string; reviewerId?: string; scopeEmployeeIds?: string[] },
): Promise<Review[]> {
  const filters = [];
  if (params.employeeId) filters.push(eq(reviews.employeeId, params.employeeId));
  if (params.reviewerId) filters.push(eq(reviews.reviewerId, params.reviewerId));
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
  return toReview(row);
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
    link: '/performance/reviews',
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
  // Block overwriting a finalized review; completed reviews are immutable.
  if (row.status === 'completed') {
    throw BadRequest('This review has already been completed');
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
    link: '/performance/reviews',
  });
  return getReview(db, id);
}
