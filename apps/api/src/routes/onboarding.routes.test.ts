import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { onboardingTasks, onboardingTemplateItems, onboardingTemplates } from '../db/schema.js';
import { createId } from '../lib/ids.js';
import {
  authHeader,
  createTestApp,
  login,
  seedUser,
  type SeededUser,
  type TestContext,
} from '../test/harness.js';

function isoIn(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('onboarding & offboarding', () => {
  let ctx: TestContext;
  let hr: SeededUser;
  let manager: SeededUser;
  let employee: SeededUser;
  let otherEmployee: SeededUser;
  let onboardingTemplateId: string;
  let offboardingTemplateId: string;

  let hrToken: string;
  let managerToken: string;
  let employeeToken: string;

  async function seedTemplate(
    name: string,
    type: 'onboarding' | 'offboarding',
    items: { title: string; assigneeRole: string; dueOffsetDays: number; category?: string }[],
    isDefault = false,
  ): Promise<string> {
    const templateId = createId('obt');
    await ctx.db.insert(onboardingTemplates).values({ id: templateId, name, type, isDefault });
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i]!;
      await ctx.db.insert(onboardingTemplateItems).values({
        id: createId('obi'),
        templateId,
        title: item.title,
        category: item.category ?? 'general',
        assigneeRole: item.assigneeRole,
        dueOffsetDays: item.dueOffsetDays,
        orderIndex: i,
      });
    }
    return templateId;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    hr = await seedUser(ctx.db, { email: 'obhr@collins.com', roles: ['hr_admin'] });
    manager = await seedUser(ctx.db, { email: 'obmgr@collins.com', roles: ['manager'] });
    employee = await seedUser(ctx.db, {
      email: 'obemp@collins.com',
      roles: ['employee'],
      managerId: manager.employeeId,
    });
    otherEmployee = await seedUser(ctx.db, { email: 'obother@collins.com', roles: ['employee'] });

    onboardingTemplateId = await seedTemplate('Standard Onboarding', 'onboarding', [
      { title: 'Sign agreement', assigneeRole: 'employee', dueOffsetDays: 0 },
      { title: 'Provision laptop', assigneeRole: 'super_admin', dueOffsetDays: 0 },
      { title: '30-day check-in', assigneeRole: 'manager', dueOffsetDays: 30 },
    ]);
    offboardingTemplateId = await seedTemplate(
      'Standard Offboarding',
      'offboarding',
      [
        { title: 'Return laptop', assigneeRole: 'employee', dueOffsetDays: 0, category: 'Asset Return' },
        {
          title: 'Revoke access',
          assigneeRole: 'super_admin',
          dueOffsetDays: 0,
          category: 'Access Revocation',
        },
      ],
      true,
    );

    hrToken = await login(ctx.app, hr.email);
    managerToken = await login(ctx.app, manager.email);
    employeeToken = await login(ctx.app, employee.email);
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function instantiate(employeeId: string, anchorDate: string, token = hrToken) {
    return ctx.app.inject({
      method: 'POST',
      url: '/api/onboarding/checklists',
      headers: authHeader(token),
      payload: { employeeId, templateId: onboardingTemplateId, anchorDate },
    });
  }

  it('instantiates a checklist from a template with computed due dates', async () => {
    const res = await instantiate(employee.employeeId, '2026-01-01');
    expect(res.statusCode).toBe(201);
    const checklist = res.json();
    expect(checklist.totalTasks).toBe(3);
    expect(checklist.completedTasks).toBe(0);
    expect(checklist.percentComplete).toBe(0);
    const checkin = checklist.tasks.find((t: { title: string }) => t.title === '30-day check-in');
    expect(checkin.dueDate).toBe('2026-01-31');
    expect(checkin.assigneeRole).toBe('manager');
  });

  it('rejects instantiation by a non-manager employee', async () => {
    const res = await instantiate(otherEmployee.employeeId, '2026-01-01', employeeToken);
    expect(res.statusCode).toBe(403);
  });

  it('tracks completion progress and completes the checklist when all tasks are done', async () => {
    const created = (await instantiate(employee.employeeId, isoIn(0))).json();
    const taskIds: string[] = created.tasks.map((t: { id: string }) => t.id);

    const first = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/onboarding/tasks/${taskIds[0]}`,
      headers: authHeader(hrToken),
      payload: { status: 'completed' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().completedTasks).toBe(1);
    expect(first.json().percentComplete).toBe(33);
    expect(first.json().status).toBe('active');

    let last;
    for (let i = 1; i < taskIds.length; i += 1) {
      last = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/onboarding/tasks/${taskIds[i]}`,
        headers: authHeader(hrToken),
        payload: { status: 'completed' },
      });
    }
    expect(last!.json().percentComplete).toBe(100);
    expect(last!.json().status).toBe('completed');

    // Unchecking a task reopens the checklist.
    const reopened = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/onboarding/tasks/${taskIds[0]}`,
      headers: authHeader(hrToken),
      payload: { status: 'pending' },
    });
    expect(reopened.json().status).toBe('active');
    expect(reopened.json().percentComplete).toBe(67);
  });

  it('reopens a completed checklist when a new task is added', async () => {
    const created = (await instantiate(employee.employeeId, isoIn(0))).json();
    for (const t of created.tasks) {
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/onboarding/tasks/${t.id}`,
        headers: authHeader(hrToken),
        payload: { status: 'completed' },
      });
    }

    const added = await ctx.app.inject({
      method: 'POST',
      url: `/api/onboarding/checklists/${created.id}/tasks`,
      headers: authHeader(hrToken),
      payload: { title: 'Extra follow-up', assigneeRole: 'manager', category: 'general' },
    });
    expect(added.statusCode).toBe(201);
    expect(added.json().status).toBe('active');
    expect(added.json().percentComplete).toBeLessThan(100);
  });

  it('derives overdue tasks from past due dates', async () => {
    const created = (await instantiate(employee.employeeId, isoIn(-10))).json();
    // anchor 10 days ago; offset-0 tasks are now overdue, the +30 task is not.
    expect(created.overdueTasks).toBe(2);
    const overdueTask = created.tasks.find((t: { overdue: boolean }) => t.overdue);
    expect(overdueTask.overdue).toBe(true);

    // Completing an overdue task clears its overdue flag.
    const done = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/onboarding/tasks/${overdueTask.id}`,
      headers: authHeader(hrToken),
      payload: { status: 'completed' },
    });
    expect(done.json().overdueTasks).toBe(1);
  });

  it('lets the new hire see and complete their own tasks', async () => {
    const created = (await instantiate(employee.employeeId, isoIn(0))).json();
    const mine = await ctx.app.inject({
      method: 'GET',
      url: '/api/onboarding/me',
      headers: authHeader(employeeToken),
    });
    expect(mine.statusCode).toBe(200);
    const ids = mine.json().map((c: { id: string }) => c.id);
    expect(ids).toContain(created.id);

    const toggle = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/onboarding/tasks/${created.tasks[0].id}`,
      headers: authHeader(employeeToken),
      payload: { status: 'completed' },
    });
    expect(toggle.statusCode).toBe(200);
  });

  it('prevents an employee from viewing another employee\'s checklist', async () => {
    const created = (await instantiate(employee.employeeId, isoIn(0))).json();
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/onboarding/checklists/${created.id}`,
      headers: authHeader(await login(ctx.app, otherEmployee.email)),
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows a manager to manage onboarding for their direct report', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/onboarding/checklists',
      headers: authHeader(managerToken),
      payload: { employeeId: employee.employeeId, templateId: onboardingTemplateId, anchorDate: isoIn(0) },
    });
    expect(res.statusCode).toBe(201);
  });

  it('triggers offboarding, creating tasks and marking the employee terminated', async () => {
    const target = await seedUser(ctx.db, { email: 'obleaver@collins.com', roles: ['employee'] });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/onboarding/offboarding',
      headers: authHeader(hrToken),
      payload: { employeeId: target.employeeId, lastDay: isoIn(14) },
    });
    expect(res.statusCode).toBe(201);
    const checklist = res.json();
    expect(checklist.type).toBe('offboarding');
    expect(checklist.totalTasks).toBe(2);
    expect(checklist.templateId).toBe(offboardingTemplateId);

    const profile = await ctx.app.inject({
      method: 'GET',
      url: `/api/employees/${target.employeeId}`,
      headers: authHeader(hrToken),
    });
    expect(profile.json().status).toBe('terminated');
  });

  it('forbids managers from triggering offboarding (HR-only)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/onboarding/offboarding',
      headers: authHeader(managerToken),
      payload: { employeeId: employee.employeeId, lastDay: isoIn(7) },
    });
    expect(res.statusCode).toBe(403);
  });

  it('enforces template management permissions', async () => {
    const forbidden = await ctx.app.inject({
      method: 'POST',
      url: '/api/onboarding/templates',
      headers: authHeader(employeeToken),
      payload: { name: 'Hacky', type: 'onboarding', items: [] },
    });
    expect(forbidden.statusCode).toBe(403);

    const created = await ctx.app.inject({
      method: 'POST',
      url: '/api/onboarding/templates',
      headers: authHeader(hrToken),
      payload: {
        name: 'Engineering Onboarding',
        type: 'onboarding',
        items: [{ title: 'Setup repo access', assigneeRole: 'super_admin', dueOffsetDays: 1 }],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().itemCount).toBe(1);
  });

  it('removes a checklist and its tasks together', async () => {
    const created = (await instantiate(employee.employeeId, isoIn(0))).json();
    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/onboarding/checklists/${created.id}`,
      headers: authHeader(hrToken),
    });
    expect(del.statusCode).toBe(204);
    const orphans = await ctx.db
      .select()
      .from(onboardingTasks)
      .where(eq(onboardingTasks.checklistId, created.id));
    expect(orphans).toHaveLength(0);
  });

  it('validates instantiation input', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/onboarding/checklists',
      headers: authHeader(hrToken),
      payload: { employeeId: employee.employeeId, templateId: onboardingTemplateId, anchorDate: 'not-a-date' },
    });
    expect(res.statusCode).toBe(400);
  });
});
