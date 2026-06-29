import type {
  Candidate,
  CandidateDetail,
  CandidateStage,
  Interview,
  JobRequisition,
  Offer,
  Paginated,
} from '@collins-hr/shared';
import {
  CANDIDATE_STAGES,
  INTERVIEW_MODES,
  SCORECARD_RECOMMENDATIONS,
} from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Briefcase, CalendarClock, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { StatCard } from '../components/ui/StatCard';
import { TBody, TD, TH, THead, TR, Table } from '../components/ui/Table';
import { api, ApiError } from '../lib/api';
import { formatCents, formatDate, formatDateTime, titleCase } from '../lib/format';

const PIPELINE_STAGES = CANDIDATE_STAGES;
const ACTIVE_STAGES: CandidateStage[] = ['applied', 'screening', 'interview', 'offer'];

const STAGE_TONE: Record<string, string> = {
  applied: 'border-slate-300',
  screening: 'border-sky-300',
  interview: 'border-violet-300',
  offer: 'border-amber-300',
  hired: 'border-emerald-400',
  rejected: 'border-red-300',
};

interface Person {
  id: string;
  name: string;
  department: string;
  title: string;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}

export function RecruitingPage() {
  const { can } = useAuth();
  const canManage = can('recruiting:write');
  const canAdmin = can('recruiting:admin');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const jobsQuery = useQuery({
    queryKey: ['recruiting', 'jobs', { status, search }],
    queryFn: () =>
      api.get<Paginated<JobRequisition>>('/recruiting/jobs', {
        status: status || undefined,
        search: search || undefined,
        pageSize: 100,
      }),
  });

  const pipelineQuery = useQuery({
    queryKey: ['recruiting', 'pipeline'],
    queryFn: () => api.get<{ stage: string; count: number }[]>('/recruiting/pipeline'),
  });

  if (selectedJobId) {
    return (
      <JobDetail
        jobId={selectedJobId}
        onBack={() => setSelectedJobId(null)}
        canManage={canManage}
        canAdmin={canAdmin}
      />
    );
  }

  const jobs = jobsQuery.data?.data ?? [];
  const pipeline = pipelineQuery.data ?? [];
  const openJobs = jobs.filter((j) => j.status === 'open').length;
  const totalCandidates = pipeline.reduce((sum, s) => sum + s.count, 0);

  return (
    <div>
      <PageHeader
        title="Recruiting"
        description="Manage open roles and your candidate pipeline."
        actions={
          canManage ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New requisition
            </Button>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open requisitions" value={openJobs} icon={Briefcase} />
        <StatCard label="Total roles" value={jobs.length} />
        <StatCard label="Candidates" value={totalCandidates} icon={Users} />
      </div>

      {pipeline.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Pipeline" subtitle="Candidates by stage" />
          <CardBody>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {PIPELINE_STAGES.map((stage) => {
                const count = pipeline.find((p) => p.stage === stage)?.count ?? 0;
                return (
                  <div key={stage} className="rounded-lg border border-slate-200 p-3 text-center">
                    <p className="text-2xl font-bold text-slate-900">{count}</p>
                    <p className="text-xs capitalize text-slate-500">{titleCase(stage)}</p>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Requisitions"
          action={
            <div className="flex items-center gap-2">
              <Input
                className="h-9 w-44"
                placeholder="Search title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search requisitions"
              />
              <Select
                className="h-9 w-36"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="">All statuses</option>
                {['draft', 'open', 'on_hold', 'closed', 'filled'].map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        <CardBody className="p-0">
          {jobsQuery.isLoading ? (
            <div className="p-6">
              <LoadingPage />
            </div>
          ) : jobsQuery.isError ? (
            <div className="p-6">
              <EmptyState icon={Briefcase} title="Couldn't load requisitions" description={errorMessage(jobsQuery.error)} />
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Briefcase}
                title="No requisitions found"
                description={status || search ? 'Try adjusting your filters.' : 'Create your first requisition to get started.'}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Title</TH>
                  <TH>Department</TH>
                  <TH>Location</TH>
                  <TH>Openings</TH>
                  <TH>Candidates</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {jobs.map((job) => (
                  <TR key={job.id} onClick={() => setSelectedJobId(job.id)}>
                    <TD className="font-medium text-slate-900">{job.title}</TD>
                    <TD>{job.department}</TD>
                    <TD>{job.location}</TD>
                    <TD>
                      {job.filledCount}/{job.openings}
                    </TD>
                    <TD>{job.activeCandidateCount ?? job.candidateCount ?? 0}</TD>
                    <TD>
                      <Badge tone={statusTone(job.status)}>{titleCase(job.status)}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {creating ? <JobFormModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function JobFormModal({ job, onClose }: { job?: JobRequisition; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = Boolean(job);
  const [form, setForm] = useState({
    title: job?.title ?? '',
    department: job?.department ?? '',
    division: job?.division ?? '',
    location: job?.location ?? '',
    employmentType: job?.employmentType ?? 'full_time',
    description: job?.description ?? '',
    openings: job?.openings ?? 1,
    salaryMin: job?.salaryMinCents ? job.salaryMinCents / 100 : '',
    salaryMax: job?.salaryMaxCents ? job.salaryMaxCents / 100 : '',
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title,
        department: form.department,
        division: form.division || null,
        location: form.location,
        employmentType: form.employmentType,
        description: form.description,
        openings: Number(form.openings),
        salaryMinCents: form.salaryMin === '' ? null : Math.round(Number(form.salaryMin) * 100),
        salaryMaxCents: form.salaryMax === '' ? null : Math.round(Number(form.salaryMax) * 100),
      };
      return editing
        ? api.patch(`/recruiting/jobs/${job!.id}`, payload)
        : api.post('/recruiting/jobs', payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recruiting'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit requisition' : 'New requisition'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>
            {editing ? 'Save changes' : 'Create draft'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <Field label="Job title" htmlFor="title">
          <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department" htmlFor="dept">
            <Input id="dept" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} required />
          </Field>
          <Field label="Division" htmlFor="division">
            <Input id="division" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location" htmlFor="loc">
            <Input id="loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
          </Field>
          <Field label="Openings" htmlFor="openings">
            <Input
              id="openings"
              type="number"
              min={1}
              value={form.openings}
              onChange={(e) => setForm({ ...form, openings: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Salary min ($)" htmlFor="smin">
            <Input id="smin" type="number" min={0} value={form.salaryMin} onChange={(e) => setForm({ ...form, salaryMin: e.target.value })} />
          </Field>
          <Field label="Salary max ($)" htmlFor="smax">
            <Input id="smax" type="number" min={0} value={form.salaryMax} onChange={(e) => setForm({ ...form, salaryMax: e.target.value })} />
          </Field>
        </div>
        <Field label="Description" htmlFor="desc">
          <Textarea id="desc" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
        </Field>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}

function JobDetail({
  jobId,
  onBack,
  canManage,
  canAdmin,
}: {
  jobId: string;
  onBack: () => void;
  canManage: boolean;
  canAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [addingCandidate, setAddingCandidate] = useState(false);
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const jobQuery = useQuery({
    queryKey: ['recruiting', 'jobs', jobId],
    queryFn: () => api.get<JobRequisition>(`/recruiting/jobs/${jobId}`),
  });
  const candidatesQuery = useQuery({
    queryKey: ['recruiting', 'jobs', jobId, 'candidates'],
    queryFn: () => api.get<Candidate[]>(`/recruiting/jobs/${jobId}/candidates`),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['recruiting'] });

  const moveStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: CandidateStage }) =>
      api.post(`/recruiting/candidates/${id}/stage`, { stage }),
    onSuccess: () => void refresh(),
    onError: (err) => setActionError(errorMessage(err)),
  });

  const approve = useMutation({
    mutationFn: () => api.post(`/recruiting/jobs/${jobId}/approve`),
    onSuccess: () => void refresh(),
    onError: (err) => setActionError(errorMessage(err)),
  });
  const changeStatus = useMutation({
    mutationFn: (next: string) => api.post(`/recruiting/jobs/${jobId}/status`, { status: next }),
    onSuccess: () => void refresh(),
    onError: (err) => setActionError(errorMessage(err)),
  });

  if (jobQuery.isLoading) return <LoadingPage />;
  if (jobQuery.isError || !jobQuery.data) {
    return (
      <div>
        <BackButton onBack={onBack} />
        <EmptyState icon={Briefcase} title="Couldn't load requisition" description={errorMessage(jobQuery.error)} />
      </div>
    );
  }

  const job = jobQuery.data;
  const candidates = candidatesQuery.data ?? [];

  return (
    <div>
      <BackButton onBack={onBack} />
      <PageHeader
        title={job.title}
        description={`${job.department}${job.division ? ` · ${job.division}` : ''} · ${job.location}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(job.status)}>{titleCase(job.status)}</Badge>
            {canAdmin && job.status === 'draft' ? (
              <Button size="sm" loading={approve.isPending} onClick={() => { setActionError(null); approve.mutate(); }}>
                Approve & post
              </Button>
            ) : null}
            {canManage && (job.status === 'open' || job.status === 'on_hold') ? (
              <Select
                className="h-8 w-32 text-xs"
                value=""
                onChange={(e) => { if (e.target.value) { setActionError(null); changeStatus.mutate(e.target.value); } }}
                aria-label="Change status"
              >
                <option value="">Change status…</option>
                {job.status === 'open' ? <option value="on_hold">Put on hold</option> : <option value="open">Reopen</option>}
                <option value="closed">Close</option>
              </Select>
            ) : null}
            {canManage && job.status !== 'closed' && job.status !== 'filled' ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
            {canManage && (job.status === 'open' || job.status === 'on_hold') ? (
              <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAddingCandidate(true)}>
                Add candidate
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Openings filled" value={`${job.filledCount}/${job.openings}`} />
        <StatCard label="Active candidates" value={candidates.filter((c) => ACTIVE_STAGES.includes(c.stage)).length} />
        <StatCard
          label="Salary range"
          value={job.salaryMinCents && job.salaryMaxCents ? `${formatCents(job.salaryMinCents)}–${formatCents(job.salaryMaxCents)}` : '—'}
        />
        <StatCard label="Posted" value={formatDate(job.postedDate)} />
      </div>

      {actionError ? <p className="mb-3 text-sm text-red-600">{actionError}</p> : null}

      {candidatesQuery.isLoading ? (
        <LoadingPage />
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No candidates yet"
          description={canManage ? 'Add a candidate to start building the pipeline.' : 'No applicants have entered the pipeline.'}
        />
      ) : (
        <KanbanBoard
          candidates={candidates}
          canManage={canManage}
          onOpen={(id) => setOpenCandidateId(id)}
          onMove={(id, stage) => { setActionError(null); moveStage.mutate({ id, stage }); }}
        />
      )}

      {editing ? <JobFormModal job={job} onClose={() => setEditing(false)} /> : null}
      {addingCandidate ? <AddCandidateModal jobId={jobId} onClose={() => setAddingCandidate(false)} /> : null}
      {openCandidateId ? (
        <CandidateModal candidateId={openCandidateId} canManage={canManage} onClose={() => setOpenCandidateId(null)} />
      ) : null}
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
      <ArrowLeft className="h-4 w-4" /> Back to requisitions
    </button>
  );
}

function KanbanBoard({
  candidates,
  canManage,
  onOpen,
  onMove,
}: {
  candidates: Candidate[];
  canManage: boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, stage: CandidateStage) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {PIPELINE_STAGES.map((stage) => {
        const inStage = candidates.filter((c) => c.stage === stage);
        const isOver = overStage === stage;
        return (
          <div
            key={stage}
            onDragOver={(e) => {
              if (!canManage || !dragId) return;
              e.preventDefault();
              setOverStage(stage);
            }}
            onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
            onDrop={() => {
              if (dragId) onMove(dragId, stage);
              setDragId(null);
              setOverStage(null);
            }}
            className={`rounded-lg border-t-4 bg-slate-50 p-2 ${STAGE_TONE[stage] ?? 'border-slate-300'} ${isOver ? 'ring-2 ring-collins-400' : ''}`}
            aria-label={`${titleCase(stage)} column`}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titleCase(stage)}</span>
              <span className="rounded-full bg-slate-200 px-2 text-xs text-slate-600">{inStage.length}</span>
            </div>
            <div className="space-y-2">
              {inStage.map((c) => (
                <button
                  key={c.id}
                  draggable={canManage}
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => { setDragId(null); setOverStage(null); }}
                  onClick={() => onOpen(c.id)}
                  className="w-full rounded-md border border-slate-200 bg-white p-2 text-left shadow-sm hover:border-collins-300 hover:shadow"
                >
                  <p className="text-sm font-medium text-slate-900">
                    {c.firstName} {c.lastName}
                  </p>
                  <p className="truncate text-xs text-slate-500">{c.email}</p>
                  {c.source ? <p className="mt-1 text-[11px] text-slate-400">{c.source}</p> : null}
                </button>
              ))}
              {inStage.length === 0 ? <p className="px-1 py-2 text-xs text-slate-400">—</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddCandidateModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', source: '' });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/recruiting/candidates', {
        jobId,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        source: form.source || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recruiting'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add candidate"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} onClick={() => { setError(null); create.mutate(); }}>
            Add candidate
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="fn">
            <Input id="fn" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="Last name" htmlFor="ln">
            <Input id="ln" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
        </div>
        <Field label="Email" htmlFor="em">
          <Input id="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" htmlFor="ph">
            <Input id="ph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Source" htmlFor="src">
            <Input id="src" placeholder="LinkedIn, Referral…" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          </Field>
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}

function CandidateModal({ candidateId, canManage, onClose }: { candidateId: string; canManage: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [scheduling, setScheduling] = useState(false);
  const [scoringInterview, setScoringInterview] = useState<Interview | null>(null);
  const [makingOffer, setMakingOffer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['recruiting', 'candidate', candidateId],
    queryFn: () => api.get<CandidateDetail>(`/recruiting/candidates/${candidateId}`),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['recruiting'] });

  const offerAction = useMutation({
    mutationFn: ({ offerId, action }: { offerId: string; action: string }) =>
      api.post(`/recruiting/offers/${offerId}/action`, { action }),
    onSuccess: () => void refresh(),
    onError: (err) => setError(errorMessage(err)),
  });

  const detail = detailQuery.data;

  return (
    <Modal open onClose={onClose} title={detail ? `${detail.firstName} ${detail.lastName}` : 'Candidate'}>
      {detailQuery.isLoading ? (
        <p className="py-6 text-sm text-slate-500">Loading…</p>
      ) : !detail ? (
        <p className="py-6 text-sm text-red-600">{errorMessage(detailQuery.error)}</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge tone={statusTone(detail.stage)}>{titleCase(detail.stage)}</Badge>
            <span>{detail.email}</span>
            {detail.phone ? <span>· {detail.phone}</span> : null}
            {detail.source ? <span>· {detail.source}</span> : null}
          </div>

          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" leftIcon={<CalendarClock className="h-4 w-4" />} onClick={() => setScheduling(true)}>
                Schedule interview
              </Button>
              {detail.stage === 'offer' && !detail.offer ? (
                <Button size="sm" variant="secondary" onClick={() => setMakingOffer(true)}>
                  Draft offer
                </Button>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-xs text-red-600">{error}</p> : null}

          {detail.offer ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Offer</h3>
              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-900">{formatCents(detail.offer.salaryCents)}</span>
                  <Badge tone={statusTone(detail.offer.status)}>{titleCase(detail.offer.status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">Start {formatDate(detail.offer.startDate)}</p>
                {canManage ? <OfferActions offer={detail.offer} onAction={(action) => { setError(null); offerAction.mutate({ offerId: detail.offer!.id, action }); }} /> : null}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Interviews</h3>
            {detail.interviews.length === 0 ? (
              <p className="text-sm text-slate-500">No interviews scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {detail.interviews.map((iv) => (
                  <li key={iv.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900">
                        {titleCase(iv.mode)} · {iv.interviewerName ?? 'Interviewer'}
                      </span>
                      <Badge tone={statusTone(iv.status)}>{titleCase(iv.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(iv.scheduledAt)} · {iv.durationMinutes} min</p>
                    {iv.scorecard ? (
                      <div className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                        <span className="font-medium">Rating {iv.scorecard.rating}/5 · {titleCase(iv.scorecard.recommendation)}</span>
                        {iv.scorecard.strengths ? <p className="mt-1">+ {iv.scorecard.strengths}</p> : null}
                        {iv.scorecard.concerns ? <p>− {iv.scorecard.concerns}</p> : null}
                      </div>
                    ) : canManage && iv.status === 'scheduled' ? (
                      <Button className="mt-2" size="sm" variant="outline" onClick={() => setScoringInterview(iv)}>
                        Submit scorecard
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Stage history</h3>
            <ol className="space-y-1.5 border-l-2 border-slate-100 pl-3">
              {detail.stageHistory.map((ev) => (
                <li key={ev.id} className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{titleCase(ev.toStage)}</span>
                  {ev.fromStage ? ` (from ${titleCase(ev.fromStage)})` : ''} · {formatDateTime(ev.createdAt)}
                  {ev.changedByName ? ` · ${ev.changedByName}` : ''}
                  {ev.note ? <span className="block text-slate-400">{ev.note}</span> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {scheduling ? <ScheduleInterviewModal candidateId={candidateId} onClose={() => setScheduling(false)} /> : null}
      {scoringInterview ? <ScorecardModal interview={scoringInterview} onClose={() => setScoringInterview(null)} /> : null}
      {makingOffer ? <OfferModal candidateId={candidateId} onClose={() => setMakingOffer(false)} /> : null}
    </Modal>
  );
}

function OfferActions({ offer, onAction }: { offer: Offer; onAction: (action: string) => void }) {
  const actions: { label: string; action: string; variant?: 'outline' | 'secondary' | 'danger' }[] = [];
  if (offer.status === 'draft') {
    actions.push({ label: 'Extend', action: 'extend', variant: 'secondary' });
    actions.push({ label: 'Rescind', action: 'rescind', variant: 'danger' });
  } else if (offer.status === 'extended') {
    actions.push({ label: 'Mark accepted', action: 'accept', variant: 'secondary' });
    actions.push({ label: 'Mark declined', action: 'decline', variant: 'outline' });
    actions.push({ label: 'Rescind', action: 'rescind', variant: 'danger' });
  }
  if (actions.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button key={a.action} size="sm" variant={a.variant ?? 'outline'} onClick={() => onAction(a.action)}>
          {a.label}
        </Button>
      ))}
    </div>
  );
}

function ScheduleInterviewModal({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ interviewerId: '', scheduledAt: '', durationMinutes: 60, mode: 'video', location: '' });
  const [error, setError] = useState<string | null>(null);

  const peopleQuery = useQuery({
    queryKey: ['recruiting', 'interviewers'],
    queryFn: () => api.get<Person[]>('/recruiting/interviewers'),
  });

  const schedule = useMutation({
    mutationFn: () =>
      api.post('/recruiting/interviews', {
        candidateId,
        interviewerId: form.interviewerId,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMinutes: Number(form.durationMinutes),
        mode: form.mode,
        location: form.location || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recruiting'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule interview"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={schedule.isPending}
            disabled={!form.interviewerId || !form.scheduledAt}
            onClick={() => { setError(null); schedule.mutate(); }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Interviewer" htmlFor="iv">
          <Select id="iv" value={form.interviewerId} onChange={(e) => setForm({ ...form, interviewerId: e.target.value })}>
            <option value="">Select interviewer…</option>
            {(peopleQuery.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.title}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="When" htmlFor="when">
            <Input id="when" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
          </Field>
          <Field label="Duration (min)" htmlFor="dur">
            <Input id="dur" type="number" min={15} step={15} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mode" htmlFor="mode">
            <Select id="mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              {INTERVIEW_MODES.map((m) => (
                <option key={m} value={m}>
                  {titleCase(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location / link" htmlFor="ivloc">
            <Input id="ivloc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Field>
        </div>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}

function ScorecardModal({ interview, onClose }: { interview: Interview; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ rating: 4, recommendation: 'yes', strengths: '', concerns: '', comments: '' });
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/recruiting/interviews/${interview.id}/scorecard`, {
        rating: Number(form.rating),
        recommendation: form.recommendation,
        strengths: form.strengths || null,
        concerns: form.concerns || null,
        comments: form.comments || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recruiting'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Interview scorecard"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={submit.isPending} onClick={() => { setError(null); submit.mutate(); }}>
            Submit
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rating (1-5)" htmlFor="rt">
            <Select id="rt" value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Recommendation" htmlFor="rec">
            <Select id="rec" value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })}>
              {SCORECARD_RECOMMENDATIONS.map((r) => (
                <option key={r} value={r}>
                  {titleCase(r)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Strengths" htmlFor="str">
          <Textarea id="str" rows={2} value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} />
        </Field>
        <Field label="Concerns" htmlFor="con">
          <Textarea id="con" rows={2} value={form.concerns} onChange={(e) => setForm({ ...form, concerns: e.target.value })} />
        </Field>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}

function OfferModal({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ salary: '', startDate: '', expiresAt: '', notes: '' });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/recruiting/offers', {
        candidateId,
        salaryCents: Math.round(Number(form.salary) * 100),
        startDate: form.startDate,
        expiresAt: form.expiresAt || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recruiting'] });
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Draft offer"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={create.isPending}
            disabled={!form.salary || !form.startDate}
            onClick={() => { setError(null); create.mutate(); }}
          >
            Create offer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base salary ($)" htmlFor="sal">
            <Input id="sal" type="number" min={0} value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
          </Field>
          <Field label="Start date" htmlFor="sd">
            <Input id="sd" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </Field>
        </div>
        <Field label="Offer expires" htmlFor="exp">
          <Input id="exp" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </Field>
        <Field label="Notes" htmlFor="nt">
          <Textarea id="nt" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}
