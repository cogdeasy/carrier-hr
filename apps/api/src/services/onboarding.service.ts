import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  hasPermission,
  type CreateChecklistTaskInput,
  type CreateOnboardingTemplateInput,
  type InstantiateChecklistInput,
  type OnboardingChecklist,
  type OnboardingChecklistStatus,
  type OnboardingPlan,
  type OnboardingTask,
  type OnboardingTaskStatus,
  type OnboardingTemplate,
  type Role,
  type TemplateItemInput,
  type TriggerOffboardingInput,
  type UpdateOnboardingTemplateInput,
  type UpdateTemplateItemInput,
} from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import {
  employees,
  onboardingChecklists,
  onboardingTasks,
  onboardingTemplateItems,
  onboardingTemplates,
} from '../db/schema.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { isoToday, nowIso } from '../lib/dates.js';
import { createId } from '../lib/ids.js';
import { displayName, toOnboardingTask } from './mappers.js';

export interface Requester {
  employeeId: string;
  roles: Role[];
}

type TaskRow = typeof onboardingTasks.$inferSelect;
type ChecklistRow = typeof onboardingChecklists.$inferSelect;
type TemplateRow = typeof onboardingTemplates.$inferSelect;
type TemplateItemRow = typeof onboardingTemplateItems.$inferSelect;

function isAdmin(roles: Role[]): boolean {
  return hasPermission(roles, 'onboarding:admin');
}

function isReadAll(roles: Role[]): boolean {
  return hasPermission(roles, 'onboarding:read');
}

/** A task is overdue when it is still open and its due date has passed. */
function isOverdue(row: { status: string; dueDate: string | null }, today: string): boolean {
  return row.status !== 'completed' && !!row.dueDate && row.dueDate < today;
}

function mapTask(row: TaskRow, today: string): OnboardingTask {
  return toOnboardingTask(row, { overdue: isOverdue(row, today) });
}

/** Adds (or subtracts) whole days to an ISO `YYYY-MM-DD` date. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function directReportIds(db: Database, managerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.managerId, managerId));
  return rows.map((r) => r.id);
}

async function assertCanManageEmployee(
  db: Database,
  requester: Requester,
  employeeId: string,
): Promise<void> {
  if (isAdmin(requester.roles)) return;
  if (requester.roles.includes('manager')) {
    const reports = await directReportIds(db, requester.employeeId);
    if (reports.includes(employeeId)) return;
  }
  throw Forbidden('You cannot manage onboarding for this employee');
}

async function visibleEmployeeIds(db: Database, requester: Requester): Promise<string[] | null> {
  if (isAdmin(requester.roles) || isReadAll(requester.roles)) return null; // null = all
  const ids = new Set<string>([requester.employeeId]);
  if (requester.roles.includes('manager')) {
    for (const id of await directReportIds(db, requester.employeeId)) ids.add(id);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

async function templateItemCount(db: Database, templateIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (templateIds.length === 0) return counts;
  const rows = await db
    .select()
    .from(onboardingTemplateItems)
    .where(inArray(onboardingTemplateItems.templateId, templateIds));
  for (const r of rows) counts.set(r.templateId, (counts.get(r.templateId) ?? 0) + 1);
  return counts;
}

function mapTemplate(row: TemplateRow, itemCount: number, items?: TemplateItemRow[]): OnboardingTemplate {
  return {
    id: row.id,
    name: row.name,
    type: row.type as OnboardingTemplate['type'],
    description: row.description,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    itemCount,
    items: items?.map((i) => ({
      id: i.id,
      templateId: i.templateId,
      title: i.title,
      description: i.description,
      category: i.category,
      assigneeRole: i.assigneeRole,
      dueOffsetDays: i.dueOffsetDays,
      orderIndex: i.orderIndex,
    })),
  };
}

export async function listTemplates(db: Database, type?: string): Promise<OnboardingTemplate[]> {
  const rows = await db
    .select()
    .from(onboardingTemplates)
    .where(type ? eq(onboardingTemplates.type, type) : undefined)
    .orderBy(desc(onboardingTemplates.isDefault), asc(onboardingTemplates.name));
  const counts = await templateItemCount(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => mapTemplate(r, counts.get(r.id) ?? 0));
}

export async function getTemplate(db: Database, id: string): Promise<OnboardingTemplate> {
  const [row] = await db
    .select()
    .from(onboardingTemplates)
    .where(eq(onboardingTemplates.id, id))
    .limit(1);
  if (!row) throw NotFound('Template not found');
  const items = await db
    .select()
    .from(onboardingTemplateItems)
    .where(eq(onboardingTemplateItems.templateId, id))
    .orderBy(asc(onboardingTemplateItems.orderIndex));
  return mapTemplate(row, items.length, items);
}

async function clearDefault(db: Database, type: string): Promise<void> {
  await db
    .update(onboardingTemplates)
    .set({ isDefault: false })
    .where(eq(onboardingTemplates.type, type));
}

export async function createTemplate(
  db: Database,
  input: CreateOnboardingTemplateInput,
): Promise<OnboardingTemplate> {
  const id = createId('obt');
  if (input.isDefault) await clearDefault(db, input.type);
  await db.insert(onboardingTemplates).values({
    id,
    name: input.name,
    type: input.type,
    description: input.description ?? null,
    isDefault: input.isDefault ?? false,
  });
  for (let i = 0; i < input.items.length; i += 1) {
    const item = input.items[i]!;
    await insertItem(db, id, item, i);
  }
  return getTemplate(db, id);
}

export async function updateTemplate(
  db: Database,
  id: string,
  input: UpdateOnboardingTemplateInput,
): Promise<OnboardingTemplate> {
  const [row] = await db
    .select()
    .from(onboardingTemplates)
    .where(eq(onboardingTemplates.id, id))
    .limit(1);
  if (!row) throw NotFound('Template not found');
  if (input.isDefault) await clearDefault(db, row.type);
  await db
    .update(onboardingTemplates)
    .set({
      name: input.name ?? row.name,
      description: input.description === undefined ? row.description : input.description,
      isDefault: input.isDefault ?? row.isDefault,
      updatedAt: nowIso(),
    })
    .where(eq(onboardingTemplates.id, id));
  return getTemplate(db, id);
}

export async function deleteTemplate(db: Database, id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(onboardingTemplates)
    .where(eq(onboardingTemplates.id, id))
    .limit(1);
  if (!row) throw NotFound('Template not found');
  await db.delete(onboardingTemplates).where(eq(onboardingTemplates.id, id));
}

async function nextItemOrder(db: Database, templateId: string): Promise<number> {
  const rows = await db
    .select({ orderIndex: onboardingTemplateItems.orderIndex })
    .from(onboardingTemplateItems)
    .where(eq(onboardingTemplateItems.templateId, templateId));
  return rows.reduce((max, r) => Math.max(max, r.orderIndex + 1), 0);
}

async function insertItem(
  db: Database,
  templateId: string,
  item: TemplateItemInput,
  orderIndex: number,
): Promise<void> {
  await db.insert(onboardingTemplateItems).values({
    id: createId('obi'),
    templateId,
    title: item.title,
    description: item.description ?? null,
    category: item.category,
    assigneeRole: item.assigneeRole,
    dueOffsetDays: item.dueOffsetDays,
    orderIndex,
  });
}

export async function addTemplateItem(
  db: Database,
  templateId: string,
  item: TemplateItemInput,
): Promise<OnboardingTemplate> {
  const [row] = await db
    .select()
    .from(onboardingTemplates)
    .where(eq(onboardingTemplates.id, templateId))
    .limit(1);
  if (!row) throw NotFound('Template not found');
  await insertItem(db, templateId, item, await nextItemOrder(db, templateId));
  return getTemplate(db, templateId);
}

export async function updateTemplateItem(
  db: Database,
  templateId: string,
  itemId: string,
  input: UpdateTemplateItemInput,
): Promise<OnboardingTemplate> {
  const [item] = await db
    .select()
    .from(onboardingTemplateItems)
    .where(
      and(eq(onboardingTemplateItems.id, itemId), eq(onboardingTemplateItems.templateId, templateId)),
    )
    .limit(1);
  if (!item) throw NotFound('Template item not found');
  await db
    .update(onboardingTemplateItems)
    .set({
      title: input.title ?? item.title,
      description: input.description === undefined ? item.description : input.description,
      category: input.category ?? item.category,
      assigneeRole: input.assigneeRole ?? item.assigneeRole,
      dueOffsetDays: input.dueOffsetDays ?? item.dueOffsetDays,
      orderIndex: input.orderIndex ?? item.orderIndex,
    })
    .where(eq(onboardingTemplateItems.id, itemId));
  return getTemplate(db, templateId);
}

export async function deleteTemplateItem(
  db: Database,
  templateId: string,
  itemId: string,
): Promise<OnboardingTemplate> {
  const [item] = await db
    .select()
    .from(onboardingTemplateItems)
    .where(
      and(eq(onboardingTemplateItems.id, itemId), eq(onboardingTemplateItems.templateId, templateId)),
    )
    .limit(1);
  if (!item) throw NotFound('Template item not found');
  await db.delete(onboardingTemplateItems).where(eq(onboardingTemplateItems.id, itemId));
  return getTemplate(db, templateId);
}

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

function checklistProgress(tasks: TaskRow[], today: string): {
  total: number;
  completed: number;
  overdue: number;
  percent: number;
} {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const overdue = tasks.filter((t) => isOverdue(t, today)).length;
  return {
    total,
    completed,
    overdue,
    percent: total ? Math.round((completed / total) * 100) : 0,
  };
}

function mapChecklist(
  row: ChecklistRow,
  tasks: TaskRow[],
  today: string,
  options: { includeTasks?: boolean; employee?: { id: string; name: string; jobTitle: string | null } } = {},
): OnboardingChecklist {
  const progress = checklistProgress(tasks, today);
  return {
    id: row.id,
    employeeId: row.employeeId,
    templateId: row.templateId,
    type: row.type as OnboardingChecklist['type'],
    title: row.title,
    status: row.status as OnboardingChecklist['status'],
    anchorDate: row.anchorDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    totalTasks: progress.total,
    completedTasks: progress.completed,
    overdueTasks: progress.overdue,
    percentComplete: progress.percent,
    employee: options.employee ?? null,
    tasks: options.includeTasks
      ? tasks
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((t) => mapTask(t, today))
      : undefined,
  };
}

async function tasksForChecklists(db: Database, checklistIds: string[]): Promise<Map<string, TaskRow[]>> {
  const map = new Map<string, TaskRow[]>();
  if (checklistIds.length === 0) return map;
  const rows = await db
    .select()
    .from(onboardingTasks)
    .where(inArray(onboardingTasks.checklistId, checklistIds));
  for (const row of rows) {
    if (!row.checklistId) continue;
    const list = map.get(row.checklistId) ?? [];
    list.push(row);
    map.set(row.checklistId, list);
  }
  return map;
}

async function employeeRefs(
  db: Database,
  ids: string[],
): Promise<Map<string, { id: string; name: string; jobTitle: string | null }>> {
  const map = new Map<string, { id: string; name: string; jobTitle: string | null }>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      jobTitle: employees.jobTitle,
    })
    .from(employees)
    .where(inArray(employees.id, ids));
  for (const r of rows) {
    map.set(r.id, { id: r.id, name: displayName(r.firstName, r.lastName), jobTitle: r.jobTitle });
  }
  return map;
}

export interface ChecklistFilters {
  employeeId?: string;
  type?: string;
  status?: string;
}

export async function listChecklists(
  db: Database,
  requester: Requester,
  filters: ChecklistFilters = {},
): Promise<OnboardingChecklist[]> {
  const today = isoToday();
  const allowed = await visibleEmployeeIds(db, requester);
  if (filters.employeeId && allowed && !allowed.includes(filters.employeeId)) {
    throw Forbidden('You cannot view onboarding for this employee');
  }

  const conditions = [];
  if (filters.employeeId) conditions.push(eq(onboardingChecklists.employeeId, filters.employeeId));
  else if (allowed) conditions.push(inArray(onboardingChecklists.employeeId, allowed));
  if (filters.type) conditions.push(eq(onboardingChecklists.type, filters.type));
  if (filters.status) conditions.push(eq(onboardingChecklists.status, filters.status));

  const rows = await db
    .select()
    .from(onboardingChecklists)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(onboardingChecklists.createdAt));

  const taskMap = await tasksForChecklists(
    db,
    rows.map((r) => r.id),
  );
  const empMap = await employeeRefs(
    db,
    rows.map((r) => r.employeeId),
  );
  return rows.map((r) =>
    mapChecklist(r, taskMap.get(r.id) ?? [], today, { employee: empMap.get(r.employeeId) }),
  );
}

async function loadChecklist(db: Database, id: string): Promise<ChecklistRow> {
  const [row] = await db
    .select()
    .from(onboardingChecklists)
    .where(eq(onboardingChecklists.id, id))
    .limit(1);
  if (!row) throw NotFound('Checklist not found');
  return row;
}

async function assertCanViewChecklist(
  db: Database,
  requester: Requester,
  checklist: ChecklistRow,
): Promise<void> {
  const allowed = await visibleEmployeeIds(db, requester);
  if (allowed && !allowed.includes(checklist.employeeId)) {
    throw Forbidden('You cannot view this checklist');
  }
}

export async function getChecklist(
  db: Database,
  requester: Requester,
  id: string,
): Promise<OnboardingChecklist> {
  const today = isoToday();
  const checklist = await loadChecklist(db, id);
  await assertCanViewChecklist(db, requester, checklist);
  const tasks = await db
    .select()
    .from(onboardingTasks)
    .where(eq(onboardingTasks.checklistId, id));
  const empMap = await employeeRefs(db, [checklist.employeeId]);
  return mapChecklist(checklist, tasks, today, {
    includeTasks: true,
    employee: empMap.get(checklist.employeeId),
  });
}

async function instantiateFromTemplate(
  db: Database,
  templateId: string,
  employeeId: string,
  anchorDate: string,
  expectedType?: string,
): Promise<string> {
  const [employee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!employee) throw NotFound('Employee not found');

  const [template] = await db
    .select()
    .from(onboardingTemplates)
    .where(eq(onboardingTemplates.id, templateId))
    .limit(1);
  if (!template) throw NotFound('Template not found');
  if (expectedType && template.type !== expectedType) {
    throw BadRequest(`Template is not a ${expectedType} template`);
  }

  const items = await db
    .select()
    .from(onboardingTemplateItems)
    .where(eq(onboardingTemplateItems.templateId, templateId))
    .orderBy(asc(onboardingTemplateItems.orderIndex));
  if (items.length === 0) throw BadRequest('Template has no tasks to instantiate');

  const checklistId = createId('obc');
  await db.insert(onboardingChecklists).values({
    id: checklistId,
    employeeId,
    templateId,
    type: template.type,
    title: template.name,
    status: 'active',
    anchorDate,
  });
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    await db.insert(onboardingTasks).values({
      id: createId('onb'),
      employeeId,
      checklistId,
      title: item.title,
      description: item.description,
      category: item.category,
      assigneeRole: item.assigneeRole,
      status: 'pending',
      dueDate: addDays(anchorDate, item.dueOffsetDays),
      orderIndex: i,
    });
  }
  return checklistId;
}

export async function instantiateChecklist(
  db: Database,
  requester: Requester,
  input: InstantiateChecklistInput,
): Promise<OnboardingChecklist> {
  await assertCanManageEmployee(db, requester, input.employeeId);
  const id = await instantiateFromTemplate(db, input.templateId, input.employeeId, input.anchorDate);
  return getChecklist(db, requester, id);
}

export async function triggerOffboarding(
  db: Database,
  requester: Requester,
  input: TriggerOffboardingInput,
): Promise<OnboardingChecklist> {
  await assertCanManageEmployee(db, requester, input.employeeId);

  let templateId = input.templateId;
  if (!templateId) {
    const [tpl] = await db
      .select({ id: onboardingTemplates.id })
      .from(onboardingTemplates)
      .where(and(eq(onboardingTemplates.type, 'offboarding'), eq(onboardingTemplates.isDefault, true)))
      .limit(1);
    if (!tpl) throw BadRequest('No default offboarding template configured');
    templateId = tpl.id;
  }

  const id = await instantiateFromTemplate(
    db,
    templateId,
    input.employeeId,
    input.lastDay,
    'offboarding',
  );

  if (input.markTerminated !== false) {
    await db
      .update(employees)
      .set({ status: 'terminated', terminationDate: input.lastDay, updatedAt: nowIso() })
      .where(eq(employees.id, input.employeeId));
  }
  return getChecklist(db, requester, id);
}

export async function updateChecklistStatus(
  db: Database,
  requester: Requester,
  id: string,
  status: OnboardingChecklistStatus,
): Promise<OnboardingChecklist> {
  const checklist = await loadChecklist(db, id);
  await assertCanManageEmployee(db, requester, checklist.employeeId);
  await db
    .update(onboardingChecklists)
    .set({ status, updatedAt: nowIso() })
    .where(eq(onboardingChecklists.id, id));
  return getChecklist(db, requester, id);
}

export async function deleteChecklist(db: Database, requester: Requester, id: string): Promise<void> {
  const checklist = await loadChecklist(db, id);
  await assertCanManageEmployee(db, requester, checklist.employeeId);
  await db.delete(onboardingChecklists).where(eq(onboardingChecklists.id, id));
}

export async function addChecklistTask(
  db: Database,
  requester: Requester,
  checklistId: string,
  input: CreateChecklistTaskInput,
): Promise<OnboardingChecklist> {
  const checklist = await loadChecklist(db, checklistId);
  await assertCanManageEmployee(db, requester, checklist.employeeId);
  const existing = await db
    .select({ orderIndex: onboardingTasks.orderIndex })
    .from(onboardingTasks)
    .where(eq(onboardingTasks.checklistId, checklistId));
  const orderIndex = existing.reduce((max, r) => Math.max(max, r.orderIndex + 1), 0);
  await db.insert(onboardingTasks).values({
    id: createId('onb'),
    employeeId: checklist.employeeId,
    checklistId,
    title: input.title,
    description: input.description ?? null,
    category: input.category,
    assigneeRole: input.assigneeRole,
    status: 'pending',
    dueDate: input.dueDate ?? null,
    orderIndex,
  });
  return getChecklist(db, requester, checklistId);
}

async function canModifyTask(db: Database, requester: Requester, task: TaskRow): Promise<boolean> {
  if (isAdmin(requester.roles)) return true;
  if (task.employeeId === requester.employeeId) return true;
  if (requester.roles.includes('manager')) {
    const reports = await directReportIds(db, requester.employeeId);
    if (reports.includes(task.employeeId)) return true;
  }
  return false;
}

async function syncChecklistCompletion(db: Database, checklistId: string): Promise<void> {
  const [checklist] = await db
    .select()
    .from(onboardingChecklists)
    .where(eq(onboardingChecklists.id, checklistId))
    .limit(1);
  if (!checklist || checklist.status === 'cancelled') return;
  const tasks = await db
    .select({ status: onboardingTasks.status })
    .from(onboardingTasks)
    .where(eq(onboardingTasks.checklistId, checklistId));
  const allDone = tasks.length > 0 && tasks.every((t) => t.status === 'completed');
  const nextStatus = allDone ? 'completed' : 'active';
  if (nextStatus !== checklist.status) {
    await db
      .update(onboardingChecklists)
      .set({ status: nextStatus, updatedAt: nowIso() })
      .where(eq(onboardingChecklists.id, checklistId));
  }
}

/** Update a single task's status. Returns the parent checklist, or the legacy plan. */
export async function updateTask(
  db: Database,
  requester: Requester,
  taskId: string,
  status: OnboardingTaskStatus,
): Promise<OnboardingChecklist | OnboardingPlan> {
  const [row] = await db
    .select()
    .from(onboardingTasks)
    .where(eq(onboardingTasks.id, taskId))
    .limit(1);
  if (!row) throw NotFound('Onboarding task not found');
  if (!(await canModifyTask(db, requester, row))) {
    throw Forbidden('You cannot update this task');
  }
  await db
    .update(onboardingTasks)
    .set({ status, completedAt: status === 'completed' ? nowIso() : null })
    .where(eq(onboardingTasks.id, taskId));

  if (row.checklistId) {
    await syncChecklistCompletion(db, row.checklistId);
    return getChecklist(db, requester, row.checklistId);
  }
  return getPlan(db, row.employeeId);
}

export async function deleteTask(db: Database, requester: Requester, taskId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(onboardingTasks)
    .where(eq(onboardingTasks.id, taskId))
    .limit(1);
  if (!row) throw NotFound('Onboarding task not found');
  await assertCanManageEmployee(db, requester, row.employeeId);
  await db.delete(onboardingTasks).where(eq(onboardingTasks.id, taskId));
  if (row.checklistId) await syncChecklistCompletion(db, row.checklistId);
}

// ---------------------------------------------------------------------------
// Employee-facing views (legacy flat plan + "my checklists")
// ---------------------------------------------------------------------------

export async function getPlan(db: Database, employeeId: string): Promise<OnboardingPlan> {
  const today = isoToday();
  const rows = await db
    .select()
    .from(onboardingTasks)
    .where(eq(onboardingTasks.employeeId, employeeId))
    .orderBy(asc(onboardingTasks.orderIndex));
  const tasks = rows.map((r) => mapTask(r, today));
  const completed = tasks.filter((t) => t.status === 'completed').length;
  return {
    employeeId,
    totalTasks: tasks.length,
    completedTasks: completed,
    percentComplete: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
    tasks,
  };
}

export async function myChecklists(
  db: Database,
  requester: Requester,
): Promise<OnboardingChecklist[]> {
  const today = isoToday();
  const rows = await db
    .select()
    .from(onboardingChecklists)
    .where(eq(onboardingChecklists.employeeId, requester.employeeId))
    .orderBy(desc(onboardingChecklists.createdAt));
  const taskMap = await tasksForChecklists(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) =>
    mapChecklist(r, taskMap.get(r.id) ?? [], today, { includeTasks: true }),
  );
}
