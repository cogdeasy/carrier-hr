import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createCandidateSchema,
  createJobSchema,
  createOfferSchema,
  jobStatusActionSchema,
  listJobsQuerySchema,
  moveCandidateStageSchema,
  offerActionSchema,
  scheduleInterviewSchema,
  submitScorecardSchema,
  updateCandidateSchema,
  updateInterviewSchema,
  updateJobSchema,
  updateOfferSchema,
} from '@collins-hr/shared';
import { parse } from '../lib/validate.js';
import {
  actOnOffer,
  approveJob,
  changeJobStatus,
  createCandidate,
  createJob,
  createOffer,
  getCandidateDetail,
  getJob,
  listAssignableEmployees,
  listCandidates,
  listJobs,
  moveCandidateStage,
  pipelineSummary,
  scheduleInterview,
  submitScorecard,
  updateCandidate,
  updateInterview,
  updateJob,
  updateOffer,
  type RecruitingActor,
} from '../services/recruiting.service.js';

const idParam = z.object({ id: z.string() });

function actor(req: FastifyRequest): RecruitingActor {
  return { employeeId: req.principal.employeeId, roles: req.principal.roles };
}

export async function recruitingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  const read = { onRequest: [app.requirePermission('recruiting:read')] };
  const write = { onRequest: [app.requirePermission('recruiting:write')] };
  const admin = { onRequest: [app.requirePermission('recruiting:admin')] };

  // Job requisitions ---------------------------------------------------------
  app.get('/jobs', read, async (req) => {
    const query = parse(listJobsQuerySchema, req.query);
    return listJobs(app.db, query, actor(req));
  });

  app.get('/pipeline', read, async (req) => pipelineSummary(app.db, actor(req)));

  app.get('/interviewers', write, async () => listAssignableEmployees(app.db));

  app.get('/jobs/:id', read, async (req) => {
    const { id } = parse(idParam, req.params);
    return getJob(app.db, id, actor(req));
  });

  app.post('/jobs', write, async (req, reply) => {
    const input = parse(createJobSchema, req.body);
    const job = await createJob(app.db, req.principal.employeeId, input);
    return reply.status(201).send(job);
  });

  app.patch('/jobs/:id', write, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateJobSchema, req.body);
    return updateJob(app.db, id, input, actor(req));
  });

  app.post('/jobs/:id/approve', admin, async (req) => {
    const { id } = parse(idParam, req.params);
    return approveJob(app.db, id, req.principal.employeeId, actor(req));
  });

  app.post('/jobs/:id/status', write, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(jobStatusActionSchema, req.body);
    return changeJobStatus(app.db, id, input, actor(req));
  });

  app.get('/jobs/:id/candidates', read, async (req) => {
    const { id } = parse(idParam, req.params);
    return listCandidates(app.db, id, actor(req));
  });

  // Candidates & pipeline ----------------------------------------------------
  app.post('/candidates', write, async (req, reply) => {
    const input = parse(createCandidateSchema, req.body);
    const candidate = await createCandidate(app.db, input, actor(req));
    return reply.status(201).send(candidate);
  });

  app.get('/candidates/:id', read, async (req) => {
    const { id } = parse(idParam, req.params);
    return getCandidateDetail(app.db, id, actor(req));
  });

  app.patch('/candidates/:id', write, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateCandidateSchema, req.body);
    return updateCandidate(app.db, id, input, actor(req));
  });

  app.post('/candidates/:id/stage', write, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(moveCandidateStageSchema, req.body);
    return moveCandidateStage(app.db, id, input, actor(req));
  });

  // Interviews & scorecards --------------------------------------------------
  app.post('/interviews', write, async (req, reply) => {
    const input = parse(scheduleInterviewSchema, req.body);
    const interview = await scheduleInterview(app.db, input, actor(req));
    return reply.status(201).send(interview);
  });

  app.patch('/interviews/:id', write, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateInterviewSchema, req.body);
    return updateInterview(app.db, id, input, actor(req));
  });

  app.post('/interviews/:id/scorecard', write, async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const input = parse(submitScorecardSchema, req.body);
    const scorecard = await submitScorecard(app.db, id, input, actor(req));
    return reply.status(201).send(scorecard);
  });

  // Offers -------------------------------------------------------------------
  app.post('/offers', write, async (req, reply) => {
    const input = parse(createOfferSchema, req.body);
    const offer = await createOffer(app.db, input, req.principal.employeeId, actor(req));
    return reply.status(201).send(offer);
  });

  app.patch('/offers/:id', write, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(updateOfferSchema, req.body);
    return updateOffer(app.db, id, input, actor(req));
  });

  app.post('/offers/:id/action', write, async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(offerActionSchema, req.body);
    return actOnOffer(app.db, id, input, actor(req));
  });
}
