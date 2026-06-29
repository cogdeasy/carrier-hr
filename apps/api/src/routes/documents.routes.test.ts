import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeader, createTestApp, login, seedUser, type TestContext } from '../test/harness.js';
import { documents } from '../db/schema.js';
import { createId } from '../lib/ids.js';

type Doc = {
  id: string;
  name: string;
  signedAt: string | null;
  signatures?: { signed: number; pending: number };
};

function createDoc(ctx: TestContext, token: string, body: Record<string, unknown>) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/documents',
    headers: authHeader(token),
    payload: body,
  });
}

describe('documents — library, visibility & e-signatures', () => {
  let ctx: TestContext;
  let hrToken: string;
  let aliceToken: string;
  let bobToken: string;
  let aliceId: string;
  let bobId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedUser(ctx.db, { email: 'docs.hr@collins.com', roles: ['hr_admin'] });
    const alice = await seedUser(ctx.db, { email: 'alice@collins.com', roles: ['employee'] });
    const bob = await seedUser(ctx.db, { email: 'bob@collins.com', roles: ['employee'] });
    aliceId = alice.employeeId;
    bobId = bob.employeeId;
    hrToken = await login(ctx.app, 'docs.hr@collins.com');
    aliceToken = await login(ctx.app, 'alice@collins.com');
    bobToken = await login(ctx.app, 'bob@collins.com');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lets HR create a company document and exposes it to everyone', async () => {
    const res = await createDoc(ctx, hrToken, {
      name: 'Employee Handbook',
      category: 'handbook',
      contentType: 'application/pdf',
      sizeBytes: 1000,
      url: 'https://files.example/handbook.pdf',
      requiresSignature: true,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().visibility).toBe('company');
    expect(res.json().version).toBe(1);

    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/documents',
      headers: authHeader(aliceToken),
    });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.some((d: Doc) => d.name === 'Employee Handbook')).toBe(true);
  });

  it('rejects a non-admin creating a document', async () => {
    const res = await createDoc(ctx, aliceToken, {
      name: 'Sneaky',
      category: 'policy',
      contentType: 'application/pdf',
      sizeBytes: 1,
      url: 'https://files.example/x.pdf',
    });
    expect(res.statusCode).toBe(403);
  });

  it('bounds metadata sizes and enforces a known category', async () => {
    const tooLong = await createDoc(ctx, hrToken, {
      name: 'x'.repeat(201),
      category: 'policy',
      contentType: 'application/pdf',
      sizeBytes: 1,
      url: 'https://files.example/x.pdf',
    });
    expect(tooLong.statusCode).toBe(400);

    const badCategory = await createDoc(ctx, hrToken, {
      name: 'Ok',
      category: 'totally-made-up',
      contentType: 'application/pdf',
      sizeBytes: 1,
      url: 'https://files.example/x.pdf',
    });
    expect(badCategory.statusCode).toBe(400);
  });

  it('keeps personal documents private to their owner and HR', async () => {
    const created = await createDoc(ctx, hrToken, {
      employeeId: aliceId,
      name: 'Alice Offer Letter',
      category: 'contract',
      contentType: 'application/pdf',
      sizeBytes: 2000,
      url: 'https://files.example/alice-offer.pdf',
    });
    expect(created.statusCode).toBe(201);
    const docId = created.json().id as string;
    expect(created.json().visibility).toBe('personal');


    // Owner can read it.
    const aliceGet = await ctx.app.inject({
      method: 'GET',
      url: `/api/documents/${docId}`,
      headers: authHeader(aliceToken),
    });
    expect(aliceGet.statusCode).toBe(200);

    // A different employee cannot read it and never sees it in their list.
    const bobGet = await ctx.app.inject({
      method: 'GET',
      url: `/api/documents/${docId}`,
      headers: authHeader(bobToken),
    });
    expect(bobGet.statusCode).toBe(403);

    const bobList = await ctx.app.inject({
      method: 'GET',
      url: '/api/documents',
      headers: authHeader(bobToken),
    });
    expect(bobList.json().items.some((d: Doc) => d.id === docId)).toBe(false);

    // HR sees every personal document.
    const hrGet = await ctx.app.inject({
      method: 'GET',
      url: `/api/documents/${docId}`,
      headers: authHeader(hrToken),
    });
    expect(hrGet.statusCode).toBe(200);
  });

  it('runs the full signature-request lifecycle and scopes it per employee', async () => {
    const created = await createDoc(ctx, hrToken, {
      name: 'Code of Conduct',
      category: 'policy',
      contentType: 'application/pdf',
      sizeBytes: 3000,
      url: 'https://files.example/coc.pdf',
    });
    const docId = created.json().id as string;

    const request = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${docId}/signature-requests`,
      headers: authHeader(hrToken),
      payload: { employeeIds: [aliceId, bobId], message: 'Please sign' },
    });
    expect(request.statusCode).toBe(201);
    expect(request.json()).toHaveLength(2);

    // Requesting signatures flips the document to require a signature.
    const docAfter = await ctx.app.inject({
      method: 'GET',
      url: `/api/documents/${docId}`,
      headers: authHeader(hrToken),
    });
    expect(docAfter.json().requiresSignature).toBe(true);
    expect(docAfter.json().signatures.pending).toBe(2);

    // Both targets see it in their inbox; an unrelated metric stays scoped.
    const aliceInbox = await ctx.app.inject({
      method: 'GET',
      url: '/api/documents/inbox',
      headers: authHeader(aliceToken),
    });
    expect(aliceInbox.json().some((d: Doc) => d.id === docId)).toBe(true);

    const aliceMine = await ctx.app.inject({
      method: 'GET',
      url: '/api/documents/signature-requests/mine',
      headers: authHeader(aliceToken),
    });
    expect(aliceMine.json().some((r: { documentId: string }) => r.documentId === docId)).toBe(true);

    // Alice signs.
    const signed = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${docId}/sign`,
      headers: authHeader(aliceToken),
    });
    expect(signed.statusCode).toBe(200);
    expect(signed.json().signedAt).toBeTruthy();

    // Alice's inbox clears for that doc; Bob still owes a signature.
    const aliceInbox2 = await ctx.app.inject({
      method: 'GET',
      url: '/api/documents/inbox',
      headers: authHeader(aliceToken),
    });
    expect(aliceInbox2.json().some((d: Doc) => d.id === docId)).toBe(false);

    const bobInbox = await ctx.app.inject({
      method: 'GET',
      url: '/api/documents/inbox',
      headers: authHeader(bobToken),
    });
    expect(bobInbox.json().some((d: Doc) => d.id === docId)).toBe(true);

    // Bob declines with a reason.
    const declined = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${docId}/decline`,
      headers: authHeader(bobToken),
      payload: { reason: 'Need legal review' },
    });
    expect(declined.statusCode).toBe(200);
    expect(declined.json().status).toBe('declined');

    // HR sees an accurate signature summary; a non-admin only sees their own request.
    const summary = await ctx.app.inject({
      method: 'GET',
      url: `/api/documents/${docId}/signatures`,
      headers: authHeader(hrToken),
    });
    expect(summary.json()).toHaveLength(2);

    const aliceScoped = await ctx.app.inject({
      method: 'GET',
      url: `/api/documents/${docId}/signatures`,
      headers: authHeader(aliceToken),
    });
    expect(aliceScoped.json()).toHaveLength(1);
    expect(aliceScoped.json()[0].employeeId).toBe(aliceId);
  });

  it('only lets admins send reminders, and only for pending requests', async () => {
    const created = await createDoc(ctx, hrToken, {
      name: 'Safety Policy',
      category: 'policy',
      contentType: 'application/pdf',
      sizeBytes: 100,
      url: 'https://files.example/safety.pdf',
    });
    const docId = created.json().id as string;
    const request = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${docId}/signature-requests`,
      headers: authHeader(hrToken),
      payload: { employeeIds: [aliceId] },
    });
    const requestId = request.json()[0].id as string;

    const forbidden = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/signature-requests/${requestId}/remind`,
      headers: authHeader(aliceToken),
    });
    expect(forbidden.statusCode).toBe(403);

    const reminded = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/signature-requests/${requestId}/remind`,
      headers: authHeader(hrToken),
    });
    expect(reminded.statusCode).toBe(200);
    expect(reminded.json().remindersSent).toBe(1);
  });

  it('cannot fan a personal document out to other employees for signature', async () => {
    const created = await createDoc(ctx, hrToken, {
      employeeId: aliceId,
      name: 'Alice PIP',
      category: 'personal',
      contentType: 'application/pdf',
      sizeBytes: 100,
      url: 'https://files.example/pip.pdf',
    });
    const docId = created.json().id as string;
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${docId}/signature-requests`,
      headers: authHeader(hrToken),
      payload: { employeeIds: [bobId] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('blocks signing another employee’s personal document', async () => {
    const created = await createDoc(ctx, hrToken, {
      employeeId: aliceId,
      name: 'Alice NDA',
      category: 'contract',
      contentType: 'application/pdf',
      sizeBytes: 100,
      url: 'https://files.example/nda.pdf',
      requiresSignature: true,
    });
    const docId = created.json().id as string;
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${docId}/sign`,
      headers: authHeader(bobToken),
    });
    expect(res.statusCode).toBe(403);
  });

  it('versions a document and keeps prior revisions auditable', async () => {
    const created = await createDoc(ctx, hrToken, {
      name: 'Travel Policy',
      category: 'policy',
      contentType: 'application/pdf',
      sizeBytes: 100,
      url: 'https://files.example/travel-v1.pdf',
    });
    const docId = created.json().id as string;

    const v2 = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${docId}/versions`,
      headers: authHeader(hrToken),
      payload: { contentType: 'application/pdf', sizeBytes: 120, url: 'https://files.example/travel-v2.pdf', note: 'Updated mileage rate' },
    });
    expect(v2.statusCode).toBe(201);
    expect(v2.json().version).toBe(2);
    expect(v2.json().url).toContain('v2');

    const versions = await ctx.app.inject({
      method: 'GET',
      url: `/api/documents/${docId}/versions`,
      headers: authHeader(hrToken),
    });
    expect(versions.json()).toHaveLength(2);
    expect(versions.json()[0].version).toBe(2);
  });

  it('rejects signing a document that does not require a signature', async () => {
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
      uploadedById: aliceId,
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${noSignId}/sign`,
      headers: authHeader(aliceToken),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('does not require a signature');
  });

  it('is idempotent when the same employee signs a company document twice', async () => {
    const created = await createDoc(ctx, hrToken, {
      name: 'Ethics Pledge',
      category: 'policy',
      contentType: 'application/pdf',
      sizeBytes: 100,
      url: 'https://files.example/ethics.pdf',
      requiresSignature: true,
    });
    const docId = created.json().id as string;
    const first = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${docId}/sign`,
      headers: authHeader(aliceToken),
    });
    const second = await ctx.app.inject({
      method: 'POST',
      url: `/api/documents/${docId}/sign`,
      headers: authHeader(aliceToken),
    });
    expect(first.json().signedAt).toBe(second.json().signedAt);
  });
});
