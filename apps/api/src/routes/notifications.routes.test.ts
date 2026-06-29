import { beforeEach, describe, expect, it } from 'vitest';
import type { NotificationType } from '@collins-hr/shared';
import { authHeader, createTestApp, login, seedUser, type TestContext } from '../test/harness.js';
import { notifications } from '../db/schema.js';
import { createId } from '../lib/ids.js';
import { createNotification } from '../services/notification.service.js';

async function insertNotification(
  ctx: TestContext,
  employeeId: string,
  overrides: Partial<{ type: NotificationType; title: string; read: boolean; createdAt: string }> = {},
): Promise<string> {
  const id = createId('ntf');
  await ctx.db.insert(notifications).values({
    id,
    employeeId,
    type: overrides.type ?? 'announcement',
    title: overrides.title ?? 'Test notification',
    body: 'Body',
    link: null,
    read: overrides.read ?? false,
    ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
  });
  return id;
}

describe('notifications routes', () => {
  let ctx: TestContext;
  let aliceId: string;
  let bobId: string;
  let aliceToken: string;
  let bobToken: string;

  beforeEach(async () => {
    ctx = await createTestApp();
    const alice = await seedUser(ctx.db, { email: 'alice@collins.com', roles: ['employee'] });
    const bob = await seedUser(ctx.db, { email: 'bob@collins.com', roles: ['employee'] });
    aliceId = alice.employeeId;
    bobId = bob.employeeId;
    aliceToken = await login(ctx.app, 'alice@collins.com');
    bobToken = await login(ctx.app, 'bob@collins.com');
  });

  it('requires authentication', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/notifications' });
    expect(res.statusCode).toBe(401);
  });

  it('lists only the caller’s notifications', async () => {
    await insertNotification(ctx, aliceId, { title: 'For Alice' });
    await insertNotification(ctx, bobId, { title: 'For Bob' });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: authHeader(aliceToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('For Alice');
    expect(body.data[0].employeeId).toBe(aliceId);
  });

  it('returns an accurate unread count scoped to the owner', async () => {
    await insertNotification(ctx, aliceId, { read: false });
    await insertNotification(ctx, aliceId, { read: false });
    await insertNotification(ctx, aliceId, { read: true });
    await insertNotification(ctx, bobId, { read: false });

    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
      headers: authHeader(aliceToken),
    });
    expect(res.json().count).toBe(2);
  });

  it('filters by unread state and by type', async () => {
    await insertNotification(ctx, aliceId, { type: 'announcement', read: true });
    await insertNotification(ctx, aliceId, { type: 'timeoff_decision', read: false });

    const unread = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications?unread=true',
      headers: authHeader(aliceToken),
    });
    expect(unread.json().total).toBe(1);
    expect(unread.json().data[0].type).toBe('timeoff_decision');

    const byType = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications?type=announcement',
      headers: authHeader(aliceToken),
    });
    expect(byType.json().total).toBe(1);
    expect(byType.json().data[0].type).toBe('announcement');

    const all = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications?unread=false',
      headers: authHeader(aliceToken),
    });
    expect(all.json().total).toBe(2);
  });

  it('paginates results newest-first', async () => {
    for (let i = 0; i < 25; i += 1) {
      await insertNotification(ctx, aliceId, {
        title: `N${i}`,
        createdAt: new Date(Date.now() - i * 60_000).toISOString(),
      });
    }

    const page1 = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications?page=1&pageSize=10',
      headers: authHeader(aliceToken),
    });
    const b1 = page1.json();
    expect(b1.total).toBe(25);
    expect(b1.totalPages).toBe(3);
    expect(b1.data).toHaveLength(10);
    expect(b1.data[0].title).toBe('N0');

    const page3 = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications?page=3&pageSize=10',
      headers: authHeader(aliceToken),
    });
    expect(page3.json().data).toHaveLength(5);
  });

  it('marks a single notification read, scoped to the owner', async () => {
    const id = await insertNotification(ctx, aliceId);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/notifications/${id}/read`,
      headers: authHeader(aliceToken),
    });
    expect(res.statusCode).toBe(200);

    const count = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
      headers: authHeader(aliceToken),
    });
    expect(count.json().count).toBe(0);
  });

  it('cannot mark another user’s notification read', async () => {
    const bobNote = await insertNotification(ctx, bobId);

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/notifications/${bobNote}/read`,
      headers: authHeader(aliceToken),
    });
    expect(res.statusCode).toBe(404);

    const bobCount = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
      headers: authHeader(bobToken),
    });
    expect(bobCount.json().count).toBe(1);
  });

  it('marks all read for the caller only', async () => {
    await insertNotification(ctx, aliceId, { read: false });
    await insertNotification(ctx, aliceId, { read: false });
    await insertNotification(ctx, bobId, { read: false });

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/notifications/read-all',
      headers: authHeader(aliceToken),
    });
    expect(res.json().updated).toBe(2);

    const bobCount = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications/unread-count',
      headers: authHeader(bobToken),
    });
    expect(bobCount.json().count).toBe(1);
  });

  it('dismisses (deletes) a notification, scoped to the owner', async () => {
    const id = await insertNotification(ctx, aliceId);

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/notifications/${id}`,
      headers: authHeader(aliceToken),
    });
    expect(del.statusCode).toBe(200);

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: authHeader(aliceToken),
    });
    expect(list.json().total).toBe(0);
  });

  it('cannot dismiss another user’s notification', async () => {
    const bobNote = await insertNotification(ctx, bobId);

    const res = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/notifications/${bobNote}`,
      headers: authHeader(aliceToken),
    });
    expect(res.statusCode).toBe(404);

    const bobList = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: authHeader(bobToken),
    });
    expect(bobList.json().total).toBe(1);
  });

  it('returns every category in preferences, defaulting to unmuted', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications/preferences',
      headers: authHeader(aliceToken),
    });
    expect(res.statusCode).toBe(200);
    const prefs = res.json().preferences as { type: string; muted: boolean }[];
    expect(prefs.length).toBeGreaterThan(0);
    expect(prefs.every((p) => p.muted === false)).toBe(true);
  });

  it('mutes a category and suppresses new notifications of that type', async () => {
    const update = await ctx.app.inject({
      method: 'PUT',
      url: '/api/notifications/preferences',
      headers: authHeader(aliceToken),
      payload: { preferences: [{ type: 'announcement', muted: true }] },
    });
    expect(update.statusCode).toBe(200);
    const muted = (update.json().preferences as { type: string; muted: boolean }[]).find(
      (p) => p.type === 'announcement',
    );
    expect(muted?.muted).toBe(true);

    await createNotification(ctx.db, {
      employeeId: aliceId,
      type: 'announcement',
      title: 'Should be dropped',
      body: 'Muted',
    });
    await createNotification(ctx.db, {
      employeeId: aliceId,
      type: 'timeoff_decision',
      title: 'Should arrive',
      body: 'Not muted',
    });

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: authHeader(aliceToken),
    });
    const titles = (list.json().data as { title: string }[]).map((n) => n.title);
    expect(titles).toContain('Should arrive');
    expect(titles).not.toContain('Should be dropped');
  });

  it('persists preference updates idempotently (upsert)', async () => {
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/notifications/preferences',
      headers: authHeader(aliceToken),
      payload: { preferences: [{ type: 'announcement', muted: true }] },
    });
    const second = await ctx.app.inject({
      method: 'PUT',
      url: '/api/notifications/preferences',
      headers: authHeader(aliceToken),
      payload: { preferences: [{ type: 'announcement', muted: false }] },
    });
    const pref = (second.json().preferences as { type: string; muted: boolean }[]).find(
      (p) => p.type === 'announcement',
    );
    expect(pref?.muted).toBe(false);
  });
});
