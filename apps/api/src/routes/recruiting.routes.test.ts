import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authHeader,
  createTestApp,
  login,
  seedUser,
  type SeededUser,
  type TestContext,
} from '../test/harness.js';

describe('recruiting / ATS', () => {
  let ctx: TestContext;
  let recruiter: SeededUser;
  let hrAdmin: SeededUser;
  let manager: SeededUser;
  let employee: SeededUser;
  let interviewer: SeededUser;
  let recruiterToken: string;
  let hrToken: string;
  let managerToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    recruiter = await seedUser(ctx.db, { email: 'rec@collins.com', roles: ['recruiter'] });
    hrAdmin = await seedUser(ctx.db, { email: 'hra@collins.com', roles: ['hr_admin'] });
    manager = await seedUser(ctx.db, {
      email: 'hm@collins.com',
      roles: ['manager'],
      firstName: 'Hiring',
      lastName: 'Manager',
    });
    employee = await seedUser(ctx.db, { email: 'emp@collins.com', roles: ['employee'] });
    interviewer = await seedUser(ctx.db, {
      email: 'panel@collins.com',
      roles: ['employee'],
      firstName: 'Panel',
      lastName: 'Member',
    });
    recruiterToken = await login(ctx.app, recruiter.email);
    hrToken = await login(ctx.app, hrAdmin.email);
    managerToken = await login(ctx.app, manager.email);
    employeeToken = await login(ctx.app, employee.email);
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function post(url: string, token: string, body?: unknown) {
    return ctx.app.inject({ method: 'POST', url, headers: authHeader(token), payload: body });
  }
  async function get(url: string, token: string) {
    return ctx.app.inject({ method: 'GET', url, headers: authHeader(token) });
  }

  async function createJob(overrides: Record<string, unknown> = {}): Promise<string> {
    const res = await post('/api/recruiting/jobs', recruiterToken, {
      title: 'Systems Engineer',
      department: 'Engineering',
      location: 'Cedar Rapids, IA',
      employmentType: 'full_time',
      description: 'Build avionics systems at Collins Aerospace.',
      openings: 1,
      ...overrides,
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function addCandidate(jobId: string, email = 'cand@example.com'): Promise<string> {
    const res = await post('/api/recruiting/candidates', recruiterToken, {
      jobId,
      firstName: 'Casey',
      lastName: 'Candidate',
      email,
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function approveAndOpen(jobId: string): Promise<void> {
    const res = await post(`/api/recruiting/jobs/${jobId}/approve`, hrToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('open');
  }

  // --- Requisition lifecycle ------------------------------------------------

  it('creates requisitions as drafts and only HR can approve to post', async () => {
    const jobId = await createJob();
    const created = await get(`/api/recruiting/jobs/${jobId}`, recruiterToken);
    expect(created.json().status).toBe('draft');

    const recruiterApprove = await post(`/api/recruiting/jobs/${jobId}/approve`, recruiterToken);
    expect(recruiterApprove.statusCode).toBe(403);

    await approveAndOpen(jobId);
    const reapprove = await post(`/api/recruiting/jobs/${jobId}/approve`, hrToken);
    expect(reapprove.statusCode).toBe(400);
  });

  it('guards manual job status transitions', async () => {
    const jobId = await createJob();
    await approveAndOpen(jobId);
    const hold = await post(`/api/recruiting/jobs/${jobId}/status`, recruiterToken, {
      status: 'on_hold',
    });
    expect(hold.statusCode).toBe(200);
    expect(hold.json().status).toBe('on_hold');

    const reopen = await post(`/api/recruiting/jobs/${jobId}/status`, recruiterToken, {
      status: 'open',
    });
    expect(reopen.json().status).toBe('open');

    const close = await post(`/api/recruiting/jobs/${jobId}/status`, recruiterToken, {
      status: 'closed',
    });
    expect(close.json().status).toBe('closed');

    const reopenClosed = await post(`/api/recruiting/jobs/${jobId}/status`, recruiterToken, {
      status: 'open',
    });
    expect(reopenClosed.statusCode).toBe(400);
  });

  it('rejects salary ranges where max < min', async () => {
    const res = await post('/api/recruiting/jobs', recruiterToken, {
      title: 'Bad Pay',
      department: 'Engineering',
      location: 'Remote',
      employmentType: 'full_time',
      description: 'Range is inverted.',
      salaryMinCents: 5000_00,
      salaryMaxCents: 1000_00,
    });
    expect(res.statusCode).toBe(400);
  });

  // --- Applications ---------------------------------------------------------

  it('blocks applications to closed requisitions and de-dupes by email', async () => {
    const jobId = await createJob();
    await approveAndOpen(jobId);
    await addCandidate(jobId, 'unique@example.com');

    const dup = await post('/api/recruiting/candidates', recruiterToken, {
      jobId,
      firstName: 'Casey',
      lastName: 'Candidate',
      email: 'UNIQUE@example.com',
    });
    expect(dup.statusCode).toBe(409);

    await post(`/api/recruiting/jobs/${jobId}/status`, recruiterToken, { status: 'closed' });
    const closedApply = await post('/api/recruiting/candidates', recruiterToken, {
      jobId,
      firstName: 'Late',
      lastName: 'Applicant',
      email: 'late@example.com',
    });
    expect(closedApply.statusCode).toBe(400);
  });

  // --- Pipeline state machine ----------------------------------------------

  it('walks the pipeline applied -> screening -> interview -> offer and records history', async () => {
    const jobId = await createJob();
    await approveAndOpen(jobId);
    const candId = await addCandidate(jobId, 'pipeline@example.com');

    for (const stage of ['screening', 'interview', 'offer']) {
      const res = await post(`/api/recruiting/candidates/${candId}/stage`, recruiterToken, {
        stage,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().stage).toBe(stage);
    }

    const detail = await get(`/api/recruiting/candidates/${candId}`, recruiterToken);
    const history = detail.json().stageHistory as { toStage: string }[];
    expect(history.map((h) => h.toStage)).toEqual(
      expect.arrayContaining(['applied', 'screening', 'interview', 'offer']),
    );
  });

  it('rejects skipping pipeline stages', async () => {
    const jobId = await createJob();
    await approveAndOpen(jobId);
    const candId = await addCandidate(jobId, 'skip@example.com');
    const skip = await post(`/api/recruiting/candidates/${candId}/stage`, recruiterToken, {
      stage: 'offer',
    });
    expect(skip.statusCode).toBe(400);
  });

  it('cannot move a candidate out of a terminal stage', async () => {
    const jobId = await createJob();
    await approveAndOpen(jobId);
    const candId = await addCandidate(jobId, 'reject@example.com');
    const reject = await post(`/api/recruiting/candidates/${candId}/stage`, recruiterToken, {
      stage: 'rejected',
    });
    expect(reject.statusCode).toBe(200);
    const revive = await post(`/api/recruiting/candidates/${candId}/stage`, recruiterToken, {
      stage: 'screening',
    });
    expect(revive.statusCode).toBe(400);
  });

  // --- Interviews & scorecards ---------------------------------------------

  it('schedules an interview and records a single scorecard', async () => {
    const jobId = await createJob();
    await approveAndOpen(jobId);
    const candId = await addCandidate(jobId, 'interview@example.com');
    await post(`/api/recruiting/candidates/${candId}/stage`, recruiterToken, { stage: 'screening' });
    await post(`/api/recruiting/candidates/${candId}/stage`, recruiterToken, { stage: 'interview' });

    const scheduled = await post('/api/recruiting/interviews', recruiterToken, {
      candidateId: candId,
      interviewerId: interviewer.employeeId,
      scheduledAt: '2026-07-15T15:00:00.000Z',
      durationMinutes: 45,
      mode: 'video',
    });
    expect(scheduled.statusCode).toBe(201);
    const interviewId = scheduled.json().id as string;

    const score = await post(`/api/recruiting/interviews/${interviewId}/scorecard`, recruiterToken, {
      rating: 4,
      recommendation: 'yes',
      strengths: 'Great communicator',
    });
    expect(score.statusCode).toBe(201);

    const dup = await post(`/api/recruiting/interviews/${interviewId}/scorecard`, recruiterToken, {
      rating: 2,
      recommendation: 'no',
    });
    expect(dup.statusCode).toBe(409);

    const detail = await get(`/api/recruiting/candidates/${candId}`, recruiterToken);
    expect(detail.json().interviews[0].status).toBe('completed');
    expect(detail.json().interviews[0].scorecard.recommendation).toBe('yes');
  });

  // --- Offers & hiring ------------------------------------------------------

  it('requires offer stage to create an offer, then accepts it to allow a hire', async () => {
    const jobId = await createJob({ openings: 1 });
    await approveAndOpen(jobId);
    const candId = await addCandidate(jobId, 'offer@example.com');

    const earlyOffer = await post('/api/recruiting/offers', recruiterToken, {
      candidateId: candId,
      salaryCents: 1500_00,
      startDate: '2026-08-01',
    });
    expect(earlyOffer.statusCode).toBe(400);

    for (const stage of ['screening', 'interview', 'offer']) {
      await post(`/api/recruiting/candidates/${candId}/stage`, recruiterToken, { stage });
    }

    const hireWithoutOffer = await post(`/api/recruiting/candidates/${candId}/stage`, recruiterToken, {
      stage: 'hired',
    });
    expect(hireWithoutOffer.statusCode).toBe(400);

    const offer = await post('/api/recruiting/offers', recruiterToken, {
      candidateId: candId,
      salaryCents: 14000000,
      startDate: '2026-08-01',
    });
    expect(offer.statusCode).toBe(201);
    const offerId = offer.json().id as string;

    await post(`/api/recruiting/offers/${offerId}/action`, recruiterToken, { action: 'extend' });
    const accept = await post(`/api/recruiting/offers/${offerId}/action`, recruiterToken, {
      action: 'accept',
    });
    expect(accept.json().status).toBe('accepted');

    const hire = await post(`/api/recruiting/candidates/${candId}/stage`, recruiterToken, {
      stage: 'hired',
    });
    expect(hire.statusCode).toBe(200);

    // The single opening is now filled, so the requisition auto-closes.
    const job = await get(`/api/recruiting/jobs/${jobId}`, recruiterToken);
    expect(job.json().status).toBe('filled');
    expect(job.json().filledCount).toBe(1);
  });

  // --- Authorization & scoping ---------------------------------------------

  it('forbids employees without recruiting access', async () => {
    const res = await get('/api/recruiting/jobs', employeeToken);
    expect(res.statusCode).toBe(403);
  });

  it('scopes hiring managers to their own requisitions', async () => {
    const mine = await createJob({ hiringManagerId: manager.employeeId });
    await approveAndOpen(mine);
    const theirs = await createJob();
    await approveAndOpen(theirs);

    const mgrToken = managerToken;
    const list = await get('/api/recruiting/jobs?pageSize=100', mgrToken);
    expect(list.statusCode).toBe(200);
    const ids = (list.json().data as { id: string }[]).map((j) => j.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);

    const forbidden = await get(`/api/recruiting/jobs/${theirs}`, mgrToken);
    expect(forbidden.statusCode).toBe(403);

    // Managers cannot create requisitions (no recruiting:write).
    const create = await post('/api/recruiting/jobs', mgrToken, {
      title: 'X',
      department: 'Engineering',
      location: 'Remote',
      employmentType: 'full_time',
      description: 'Managers may not post.',
    });
    expect(create.statusCode).toBe(403);
  });

  it('supports filtering and pagination on the jobs list', async () => {
    const res = await get('/api/recruiting/jobs?status=draft&page=1&pageSize=5', recruiterToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pageSize).toBe(5);
    expect((body.data as { status: string }[]).every((j) => j.status === 'draft')).toBe(true);
  });
});
