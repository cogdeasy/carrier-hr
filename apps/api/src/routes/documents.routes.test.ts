import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, createTestApp, login, seedUser, type TestContext } from '../test/harness.js';
import { documents } from '../db/schema.js';
import { createId } from '../lib/ids.js';

describe('documents — per-employee signatures', () => {
  let ctx: TestContext;
  let companyDocId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const hr = await seedUser(ctx.db, { email: 'docs.hr@carrier.com', roles: ['hr_admin'] });
    await seedUser(ctx.db, { email: 'alice@carrier.com', roles: ['employee'] });
    await seedUser(ctx.db, { email: 'bob@carrier.com', roles: ['employee'] });

    companyDocId = createId('doc');
    await ctx.db.insert(documents).values({
      id: companyDocId,
      employeeId: null,
      name: 'Employee Handbook',
      category: 'policy',
      contentType: 'application/pdf',
      sizeBytes: 1000,
      url: 'https://files.example/handbook.pdf',
      requiresSignature: true,
      uploadedById: hr.employeeId,
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('keeps a company-wide document unsigned for others after one employee signs it', async () => {
    const aliceToken = await login(ctx.app, 'alice@carrier.com');
    const bobToken = await login(ctx.app, 'bob@carrier.com');

    const signed = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${companyDocId}/sign`,
      headers: authHeader(aliceToken),
    });
    expect(signed.statusCode).toBe(200);
    expect(signed.json().signedAt).toBeTruthy();

    const aliceList = await ctx.app.inject({
      method: 'GET',
      url: '/api/documents',
      headers: authHeader(aliceToken),
    });
    const aliceDoc = aliceList.json().find((d: { id: string }) => d.id === companyDocId);
    expect(aliceDoc.signedAt).toBeTruthy();

    // Bob must still see the document as unsigned (his signature was never collected).
    const bobList = await ctx.app.inject({
      method: 'GET',
      url: '/api/documents',
      headers: authHeader(bobToken),
    });
    const bobDoc = bobList.json().find((d: { id: string }) => d.id === companyDocId);
    expect(bobDoc.signedAt).toBeNull();
  });

  it('rejects signing a document that does not require a signature', async () => {
    const hr = await seedUser(ctx.db, { email: 'docs.hr2@carrier.com', roles: ['hr_admin'] });
    const noSignId = createId('doc');
    await ctx.db.insert(documents).values({
      id: noSignId,
      employeeId: null,
      name: 'Reference Guide',
      category: 'policy',
      contentType: 'application/pdf',
      sizeBytes: 500,
      url: 'https://files.example/guide.pdf',
      requiresSignature: false,
      uploadedById: hr.employeeId,
    });
    const aliceToken = await login(ctx.app, 'alice@carrier.com');
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${noSignId}/sign`,
      headers: authHeader(aliceToken),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('does not require a signature');
  });

  it('is idempotent when the same employee signs twice', async () => {
    const aliceToken = await login(ctx.app, 'alice@carrier.com');
    const first = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${companyDocId}/sign`,
      headers: authHeader(aliceToken),
    });
    const second = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${companyDocId}/sign`,
      headers: authHeader(aliceToken),
    });
    expect(first.json().signedAt).toBe(second.json().signedAt);
  });
});
