import { and, asc, eq } from 'drizzle-orm';
import type { OnboardingPlan, OnboardingTaskStatus } from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import { onboardingTasks } from '../db/schema.js';
import { Forbidden, NotFound } from '../lib/errors.js';
import { nowIso } from '../lib/dates.js';
import { toOnboardingTask } from './mappers.js';

export async function getPlan(db: Database, employeeId: string): Promise<OnboardingPlan> {
  const rows = await db
    .select()
    .from(onboardingTasks)
    .where(eq(onboardingTasks.employeeId, employeeId))
    .orderBy(asc(onboardingTasks.orderIndex));
  const tasks = rows.map(toOnboardingTask);
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return {
    employeeId,
    totalTasks: tasks.length,
    completedTasks: completed,
    percentComplete: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
    tasks,
  };
}

export async function updateTask(
  db: Database,
  taskId: string,
  status: OnboardingTaskStatus,
  requester: { employeeId: string; canManage: boolean },
): Promise<OnboardingPlan> {
  const [row] = await db
    .select()
    .from(onboardingTasks)
    .where(eq(onboardingTasks.id, taskId))
    .limit(1);
  if (!row) throw NotFound('Onboarding task not found');
  if (!requester.canManage && row.employeeId !== requester.employeeId) {
    throw Forbidden('You can only update your own onboarding tasks');
  }
  await db
    .update(onboardingTasks)
    .set({ status, completedAt: status === 'completed' ? nowIso() : null })
    .where(eq(onboardingTasks.id, taskId));
  return getPlan(db, row.employeeId);
}

export async function tasksAssignedToRole(
  db: Database,
  employeeId: string,
  role: string,
): Promise<OnboardingPlan> {
  const rows = await db
    .select()
    .from(onboardingTasks)
    .where(and(eq(onboardingTasks.employeeId, employeeId), eq(onboardingTasks.assigneeRole, role)))
    .orderBy(asc(onboardingTasks.orderIndex));
  const tasks = rows.map(toOnboardingTask);
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return {
    employeeId,
    totalTasks: tasks.length,
    completedTasks: completed,
    percentComplete: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
    tasks,
  };
}
