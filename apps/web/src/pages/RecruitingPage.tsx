import type { Candidate, JobRequisition } from '@carrier-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase } from 'lucide-react';
import { useState } from 'react';
import { Badge, statusTone } from '../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { StatCard } from '../components/ui/StatCard';
import { TBody, TD, TH, THead, TR, Table } from '../components/ui/Table';
import { api } from '../lib/api';
import { formatCents, titleCase } from '../lib/format';

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;

export function RecruitingPage() {
  const [selectedJob, setSelectedJob] = useState<JobRequisition | null>(null);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['recruiting', 'jobs'],
    queryFn: () => api.get<JobRequisition[]>('/recruiting/jobs'),
  });

  const { data: pipeline = [] } = useQuery({
    queryKey: ['recruiting', 'pipeline'],
    queryFn: () => api.get<{ stage: string; count: number }[]>('/recruiting/pipeline'),
  });

  if (isLoading) return <LoadingPage />;

  const openJobs = jobs.filter((j) => j.status === 'open').length;
  const totalCandidates = pipeline.reduce((sum, s) => sum + s.count, 0);

  return (
    <div>
      <PageHeader title="Recruiting" description="Manage open roles and your candidate pipeline." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open requisitions" value={openJobs} icon={Briefcase} />
        <StatCard label="Total roles" value={jobs.length} />
        <StatCard label="Candidates" value={totalCandidates} />
      </div>

      {pipeline.length > 0 ? (
        <Card className="mb-6">
          <CardHeader title="Pipeline" subtitle="Candidates by stage" />
          <CardBody>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {STAGES.map((stage) => {
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
        <CardHeader title="Open roles" />
        <CardBody className="p-0">
          {jobs.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Briefcase} title="No open requisitions" />
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
                  <TR key={job.id} onClick={() => setSelectedJob(job)}>
                    <TD className="font-medium text-slate-900">{job.title}</TD>
                    <TD>{job.department}</TD>
                    <TD>{job.location}</TD>
                    <TD>{job.openings}</TD>
                    <TD>{job.candidateCount ?? 0}</TD>
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

      {selectedJob ? <JobCandidates job={selectedJob} onClose={() => setSelectedJob(null)} /> : null}
    </div>
  );
}

function JobCandidates({ job, onClose }: { job: JobRequisition; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: candidates = [] } = useQuery({
    queryKey: ['recruiting', 'jobs', job.id, 'candidates'],
    queryFn: () => api.get<Candidate[]>(`/recruiting/jobs/${job.id}/candidates`),
  });

  const updateStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.patch(`/recruiting/candidates/${id}`, { stage }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['recruiting'] });
    },
  });

  return (
    <Card className="mt-6">
      <CardHeader
        title={`Candidates · ${job.title}`}
        subtitle={
          job.salaryMinCents && job.salaryMaxCents
            ? `${formatCents(job.salaryMinCents)} – ${formatCents(job.salaryMaxCents)}`
            : undefined
        }
        action={
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700">
            Close
          </button>
        }
      />
      <CardBody className="p-0">
        {candidates.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">No candidates yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Source</TH>
                <TH>Stage</TH>
              </TR>
            </THead>
            <TBody>
              {candidates.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium text-slate-900">
                    {c.firstName} {c.lastName}
                  </TD>
                  <TD>{c.email}</TD>
                  <TD>{c.source ?? '—'}</TD>
                  <TD>
                    <Select
                      className="h-8 w-36 py-0 text-xs"
                      value={c.stage}
                      onChange={(e) => updateStage.mutate({ id: c.id, stage: e.target.value })}
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {titleCase(s)}
                        </option>
                      ))}
                    </Select>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}
