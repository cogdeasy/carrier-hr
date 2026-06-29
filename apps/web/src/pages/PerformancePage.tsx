import type {
  CreateGoalInput,
  CreateOneOnOneInput,
  CreateReviewCycleInput,
  Employee,
  Goal,
  GoalStatus,
  OneOnOne,
  Review,
  ReviewCycle,
} from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardList,
  Plus,
  Target,
  Users,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage, Spinner } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { formatDate, formatDateTime, titleCase } from '../lib/format';

type Tab = 'goals' | 'reviews' | 'oneOnOnes' | 'cycles';

const TABS: readonly Tab[] = ['goals', 'reviews', 'oneOnOnes', 'cycles'];
const isTab = (v: string | null): v is Tab => v != null && (TABS as readonly string[]).includes(v);

export function PerformancePage() {
  const { user, can } = useAuth();
  const [params, setParams] = useSearchParams();
  // Derive the active tab from the URL so notification deep-links (?tab=reviews)
  // switch tabs even when the page is already mounted.
  const tab: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'goals';
  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p, { replace: true });
  };
  const canReviewTeam = can('performance:read:team');
  const isHr = can('performance:admin');

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'goals', label: 'Goals', show: true },
    { id: 'reviews', label: 'Reviews', show: true },
    { id: 'oneOnOnes', label: '1:1 Meetings', show: true },
    { id: 'cycles', label: 'Review Cycles', show: isHr },
  ];

  return (
    <div>
      <PageHeader title="Performance" description="Goals, reviews, and 1:1 meetings." />

      <div className="mb-6 border-b border-slate-200">
        <nav className="-mb-px flex gap-1" role="tablist" aria-label="Performance sections">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={
                  tab === t.id
                    ? 'border-b-2 border-collins-600 px-4 py-2.5 text-sm font-semibold text-collins-700'
                    : 'border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700'
                }
              >
                {t.label}
              </button>
            ))}
        </nav>
      </div>

      {tab === 'goals' ? <GoalsTab canViewTeam={canReviewTeam} /> : null}
      {tab === 'reviews' ? <ReviewsTab employeeId={user?.employeeId ?? ''} /> : null}
      {tab === 'oneOnOnes' ? (
        <OneOnOnesTab employeeId={user?.employeeId ?? ''} canSchedule={can('performance:review')} />
      ) : null}
      {tab === 'cycles' && isHr ? <CyclesTab /> : null}
    </div>
  );
}

/* ----------------------------- Goals ----------------------------------- */

const GOAL_COLUMNS: { status: GoalStatus; label: string }[] = [
  { status: 'draft', label: 'Draft' },
  { status: 'active', label: 'Active' },
  { status: 'at_risk', label: 'At risk' },
  { status: 'completed', label: 'Completed' },
  { status: 'cancelled', label: 'Cancelled' },
];

function GoalsTab({ canViewTeam }: { canViewTeam: boolean }) {
  const qc = useQueryClient();
  const [view, setView] = useState<'own' | 'team'>('own');
  const [goalOpen, setGoalOpen] = useState(false);

  const ownQuery = useQuery({
    queryKey: ['performance', 'goals', 'own'],
    queryFn: () => api.get<Goal[]>('/performance/goals'),
  });
  const teamQuery = useQuery({
    queryKey: ['performance', 'goals', 'team'],
    queryFn: () => api.get<Goal[]>('/performance/goals', { scope: 'team' }),
    enabled: canViewTeam && view === 'team',
  });

  const active = view === 'team' ? teamQuery : ownQuery;
  const goals = active.data ?? [];

  const updateGoal = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/performance/goals/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['performance', 'goals'] });
    },
  });

  const deleteGoal = useMutation({
    mutationFn: (id: string) => api.delete(`/performance/goals/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['performance', 'goals'] });
    },
  });

  if (active.isLoading) return <LoadingPage />;
  if (active.isError) {
    return <ErrorState onRetry={() => void active.refetch()} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {canViewTeam ? (
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
              {(['own', 'team'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={
                    view === v
                      ? 'rounded-md bg-collins-600 px-3 py-1 text-sm font-medium text-white'
                      : 'rounded-md px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-900'
                  }
                >
                  {v === 'own' ? 'My goals' : 'Team goals'}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {view === 'own' ? (
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setGoalOpen(true)}>
            New goal
          </Button>
        ) : null}
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Target}
              title={view === 'team' ? 'No team goals yet' : 'No goals yet'}
              description={
                view === 'team'
                  ? 'Your reports have not set any goals.'
                  : 'Set your first goal to get started.'
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {GOAL_COLUMNS.map((col) => {
            const colGoals = goals.filter((g) => g.status === col.status);
            return (
              <div key={col.status} className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {col.label}
                  </h3>
                  <span className="text-xs text-slate-400">{colGoals.length}</span>
                </div>
                {colGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    readOnly={view === 'team'}
                    onProgress={(progress) =>
                      updateGoal.mutate({ id: goal.id, body: { progress } })
                    }
                    onStatus={(status) => updateGoal.mutate({ id: goal.id, body: { status } })}
                    onDelete={() => deleteGoal.mutate(goal.id)}
                  />
                ))}
                {colGoals.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                    Empty
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <GoalModal open={goalOpen} onClose={() => setGoalOpen(false)} />
    </div>
  );
}

function GoalCard({
  goal,
  readOnly,
  onProgress,
  onStatus,
  onDelete,
}: {
  goal: Goal;
  readOnly: boolean;
  onProgress: (progress: number) => void;
  onStatus: (status: GoalStatus) => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">{goal.title}</p>
          <Badge tone={statusTone(goal.status)}>{titleCase(goal.status)}</Badge>
        </div>
        {goal.description ? <p className="text-xs text-slate-500">{goal.description}</p> : null}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Progress</span>
            <span>{goal.progress}%</span>
          </div>
          <div
            className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={goal.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-collins-600"
              style={{ width: `${goal.progress}%` }}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          {goal.dueDate ? `Due ${formatDate(goal.dueDate)}` : 'No due date'}
        </p>
        {!readOnly ? (
          <div className="space-y-2 border-t border-slate-100 pt-2">
            <div className="flex flex-wrap items-center gap-1">
              <label className="sr-only" htmlFor={`progress-${goal.id}`}>
                Update progress
              </label>
              {[0, 25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  id={p === 0 ? `progress-${goal.id}` : undefined}
                  onClick={() => onProgress(p)}
                  className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-collins-300 hover:text-collins-700"
                >
                  {p}%
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Select
                aria-label="Goal status"
                value={goal.status}
                onChange={(e) => onStatus(e.target.value as GoalStatus)}
                className="h-8 py-0 text-xs"
              >
                {(['draft', 'active', 'at_risk', 'completed', 'cancelled'] as GoalStatus[]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ),
                )}
              </Select>
              <button
                onClick={onDelete}
                className="text-xs font-medium text-slate-400 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function GoalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const { data: cycles = [] } = useQuery({
    queryKey: ['performance', 'cycles'],
    queryFn: () => api.get<ReviewCycle[]>('/performance/cycles'),
    enabled: open,
  });
  const [cycleId, setCycleId] = useState('');

  const mutation = useMutation({
    mutationFn: (input: CreateGoalInput) => api.post('/performance/goals', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['performance', 'goals'] });
      setTitle('');
      setDescription('');
      setDueDate('');
      setCycleId('');
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({
      title,
      description: description || undefined,
      dueDate: dueDate || undefined,
      cycleId: cycleId || undefined,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New goal"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="goal-form" type="submit" loading={mutation.isPending}>
            Create goal
          </Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Title" htmlFor="goal-title">
          <Input
            id="goal-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Description (optional)" htmlFor="goal-desc">
          <Textarea
            id="goal-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Due date (optional)" htmlFor="goal-due">
          <Input
            id="goal-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
        <Field label="Link to review cycle (optional)" htmlFor="goal-cycle">
          <Select id="goal-cycle" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
            <option value="">None</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {mutation.isError ? (
          <p className="text-sm text-red-600">Could not create goal. Please try again.</p>
        ) : null}
      </form>
    </Modal>
  );
}

/* ----------------------------- Reviews --------------------------------- */

function ReviewsTab({ employeeId }: { employeeId: string }) {
  const { data: reviews, isLoading, isError, refetch } = useQuery({
    queryKey: ['performance', 'reviews'],
    queryFn: () => api.get<Review[]>('/performance/reviews'),
  });
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) return <LoadingPage />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const all = reviews ?? [];
  const mine = all.filter((r) => r.employeeId === employeeId);
  const toGive = all.filter((r) => r.reviewerId === employeeId && r.employeeId !== employeeId);
  const open = openId ? all.find((r) => r.id === openId) ?? null : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ReviewColumn
        title="My reviews"
        emptyText="You have no reviews assigned."
        reviews={mine}
        employeeId={employeeId}
        onOpen={setOpenId}
      />
      <ReviewColumn
        title="Reviews to complete"
        emptyText="You have no reviews to complete for your reports."
        reviews={toGive}
        employeeId={employeeId}
        onOpen={setOpenId}
      />
      {open ? (
        <ReviewModal
          review={open}
          employeeId={employeeId}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

function ReviewColumn({
  title,
  emptyText,
  reviews,
  employeeId,
  onOpen,
}: {
  title: string;
  emptyText: string;
  reviews: Review[];
  employeeId: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      <Card>
        <CardBody className="p-0">
          {reviews.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">{emptyText}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {reviews.map((r) => {
                const subject =
                  r.employeeId === employeeId ? 'You' : r.employee?.displayName ?? 'Employee';
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => onOpen(r.id)}
                      className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {r.cycle?.name ?? 'Review'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {subject}
                          {r.overallRating ? ` · ${r.overallRating}/5` : ''}
                        </p>
                      </div>
                      <Badge tone={statusTone(r.status)}>{titleCase(r.status)}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function ReviewModal({
  review,
  employeeId,
  onClose,
}: {
  review: Review;
  employeeId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isSubject = review.employeeId === employeeId;
  const isReviewer = review.reviewerId === employeeId;
  const [selfAssessment, setSelfAssessment] = useState(review.selfAssessment ?? '');
  const [managerAssessment, setManagerAssessment] = useState(review.managerAssessment ?? '');
  const [rating, setRating] = useState(review.overallRating ?? 3);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['performance', 'reviews'] });
  };

  const submitSelf = useMutation({
    mutationFn: () => api.post(`/performance/reviews/${review.id}/self`, { selfAssessment }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const submitManager = useMutation({
    mutationFn: () =>
      api.post(`/performance/reviews/${review.id}/manager`, {
        managerAssessment,
        overallRating: rating,
      }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const canSelf = isSubject && (review.status === 'not_started' || review.status === 'self_review');
  const canManager = isReviewer && review.status === 'manager_review';
  const err = submitSelf.isError || submitManager.isError;

  return (
    <Modal
      open
      onClose={onClose}
      title={review.cycle?.name ?? 'Performance review'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canSelf ? (
            <Button
              onClick={() => submitSelf.mutate()}
              loading={submitSelf.isPending}
              disabled={selfAssessment.trim().length === 0}
            >
              Submit self-assessment
            </Button>
          ) : null}
          {canManager ? (
            <Button
              onClick={() => submitManager.mutate()}
              loading={submitManager.isPending}
              disabled={managerAssessment.trim().length === 0}
            >
              Submit & complete
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge tone={statusTone(review.status)}>{titleCase(review.status)}</Badge>
          <span className="text-xs text-slate-400">
            Stage {stageNumber(review.status)} of 3
          </span>
        </div>

        <Field label="Self-assessment" htmlFor="self-assessment">
          {canSelf ? (
            <Textarea
              id="self-assessment"
              rows={4}
              value={selfAssessment}
              onChange={(e) => setSelfAssessment(e.target.value)}
              placeholder="Summarise your accomplishments and growth areas."
            />
          ) : (
            <ReadOnlyText value={review.selfAssessment} placeholder="Not yet submitted." />
          )}
        </Field>

        {review.status === 'manager_review' || review.status === 'completed' || isReviewer ? (
          <Field label="Manager assessment" htmlFor="manager-assessment">
            {canManager ? (
              <Textarea
                id="manager-assessment"
                rows={4}
                value={managerAssessment}
                onChange={(e) => setManagerAssessment(e.target.value)}
                placeholder="Provide feedback and an overall rating."
              />
            ) : (
              <ReadOnlyText value={review.managerAssessment} placeholder="Not yet submitted." />
            )}
          </Field>
        ) : null}

        {canManager ? (
          <Field label="Overall rating" htmlFor="rating">
            <Select
              id="rating"
              value={rating}
              onChange={(e) => setRating(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </Select>
          </Field>
        ) : review.overallRating ? (
          <p className="text-sm text-slate-600">
            Overall rating: <span className="font-semibold">{review.overallRating}/5</span>
          </p>
        ) : null}

        {err ? (
          <p className="text-sm text-red-600">
            Could not submit. The review may have already advanced.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function ReadOnlyText({ value, placeholder }: { value: string | null; placeholder: string }) {
  return (
    <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
      {value ? value : <span className="text-slate-400">{placeholder}</span>}
    </p>
  );
}

function stageNumber(status: Review['status']): number {
  switch (status) {
    case 'not_started':
    case 'self_review':
      return 1;
    case 'manager_review':
    case 'calibration':
      return 2;
    case 'completed':
      return 3;
    default:
      return 1;
  }
}

/* ----------------------------- 1:1 meetings ---------------------------- */

function OneOnOnesTab({ employeeId, canSchedule }: { employeeId: string; canSchedule: boolean }) {
  const { data: meetings, isLoading, isError, refetch } = useQuery({
    queryKey: ['performance', 'one-on-ones'],
    queryFn: () => api.get<OneOnOne[]>('/performance/one-on-ones'),
  });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) return <LoadingPage />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const all = meetings ?? [];
  const now = Date.now();
  const upcoming = all
    .filter((m) => !m.completed && new Date(m.scheduledFor).getTime() >= now)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const past = all
    .filter((m) => m.completed || new Date(m.scheduledFor).getTime() < now)
    .sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
  const open = openId ? all.find((m) => m.id === openId) ?? null : null;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {canSchedule ? (
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setScheduleOpen(true)}>
            Schedule 1:1
          </Button>
        ) : null}
      </div>

      {all.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={CalendarClock}
              title="No 1:1s scheduled"
              description={
                canSchedule
                  ? 'Schedule a 1:1 with one of your direct reports.'
                  : 'Your manager has not scheduled any 1:1s yet.'
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-8">
          <MeetingTimeline
            title="Upcoming"
            meetings={upcoming}
            employeeId={employeeId}
            onOpen={setOpenId}
          />
          <MeetingTimeline
            title="Past"
            meetings={past}
            employeeId={employeeId}
            onOpen={setOpenId}
          />
        </div>
      )}

      {scheduleOpen ? <ScheduleModal onClose={() => setScheduleOpen(false)} /> : null}
      {open ? (
        <MeetingModal
          meeting={open}
          employeeId={employeeId}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

function MeetingTimeline({
  title,
  meetings,
  employeeId,
  onOpen,
}: {
  title: string;
  meetings: OneOnOne[];
  employeeId: string;
  onOpen: (id: string) => void;
}) {
  if (meetings.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <ol className="relative space-y-3 border-l border-slate-200 pl-5">
        {meetings.map((m) => {
          const counterpart =
            m.managerId === employeeId
              ? m.employee?.displayName ?? 'Report'
              : m.manager?.displayName ?? 'Manager';
          const openItems = (m.actionItems ?? []).filter((i) => !i.completed).length;
          return (
            <li key={m.id} className="relative">
              <span className="absolute -left-[1.45rem] top-3 h-2.5 w-2.5 rounded-full border-2 border-white bg-collins-500" />
              <button
                onClick={() => onOpen(m.id)}
                className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-collins-300"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-900">{counterpart}</p>
                  {m.completed ? (
                    <Badge tone="neutral">Completed</Badge>
                  ) : (
                    <Badge tone="info">Scheduled</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(m.scheduledFor)}</p>
                {openItems > 0 ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600">
                    <ClipboardList className="h-3 w-3" /> {openItems} open action item
                    {openItems === 1 ? '' : 's'}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ScheduleModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['performance', 'direct-reports'],
    queryFn: () => api.get<Employee[]>('/performance/direct-reports'),
  });
  const [employeeIdSel, setEmployeeIdSel] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [agenda, setAgenda] = useState('');

  const mutation = useMutation({
    mutationFn: (input: CreateOneOnOneInput) => api.post('/performance/one-on-ones', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['performance', 'one-on-ones'] });
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({
      employeeId: employeeIdSel,
      scheduledFor: new Date(scheduledFor).toISOString(),
      agenda: agenda || undefined,
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule 1:1"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="schedule-form"
            type="submit"
            loading={mutation.isPending}
            disabled={!employeeIdSel || !scheduledFor}
          >
            Schedule
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Direct report" htmlFor="report">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Spinner /> Loading reports…
            </div>
          ) : reports.length === 0 ? (
            <p className="text-sm text-slate-500">You have no direct reports.</p>
          ) : (
            <Select
              id="report"
              required
              value={employeeIdSel}
              onChange={(e) => setEmployeeIdSel(e.target.value)}
            >
              <option value="">Select a report…</option>
              {reports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Date & time" htmlFor="scheduled">
          <Input
            id="scheduled"
            type="datetime-local"
            required
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
          />
        </Field>
        <Field label="Agenda (optional)" htmlFor="agenda">
          <Textarea
            id="agenda"
            rows={3}
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
          />
        </Field>
        {mutation.isError ? (
          <p className="text-sm text-red-600">Could not schedule the meeting.</p>
        ) : null}
      </form>
    </Modal>
  );
}

function MeetingModal({
  meeting,
  employeeId,
  onClose,
}: {
  meeting: OneOnOne;
  employeeId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isOrganiser = meeting.managerId === employeeId;
  const [agenda, setAgenda] = useState(meeting.agenda ?? '');
  const [notes, setNotes] = useState(meeting.notes ?? '');
  const [newItem, setNewItem] = useState('');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['performance', 'one-on-ones'] });
  };

  const save = useMutation({
    mutationFn: () => api.patch(`/performance/one-on-ones/${meeting.id}`, { agenda, notes }),
    onSuccess: invalidate,
  });
  const complete = useMutation({
    mutationFn: () =>
      api.patch(`/performance/one-on-ones/${meeting.id}`, { completed: !meeting.completed }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });
  const addItem = useMutation({
    mutationFn: () =>
      api.post(`/performance/one-on-ones/${meeting.id}/action-items`, { title: newItem }),
    onSuccess: () => {
      setNewItem('');
      invalidate();
    },
  });
  const toggleItem = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api.patch(`/performance/action-items/${id}`, { completed }),
    onSuccess: invalidate,
  });

  const counterpart = isOrganiser
    ? meeting.employee?.displayName ?? 'Report'
    : meeting.manager?.displayName ?? 'Manager';
  const items = meeting.actionItems ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title={`1:1 with ${counterpart}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {isOrganiser ? (
            <Button variant="outline" onClick={() => complete.mutate()} loading={complete.isPending}>
              {meeting.completed ? 'Reopen' : 'Mark complete'}
            </Button>
          ) : null}
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Save notes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500">{formatDateTime(meeting.scheduledFor)}</p>

        <Field label="Agenda" htmlFor="m-agenda">
          <Textarea
            id="m-agenda"
            rows={2}
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder="What will you discuss?"
          />
        </Field>

        <Field label="Shared notes" htmlFor="m-notes">
          <Textarea
            id="m-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes are visible to both participants."
          />
        </Field>

        <div>
          <p className="label">Action items</p>
          {items.length === 0 ? (
            <p className="text-sm text-slate-400">No action items yet.</p>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <button
                    aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
                    onClick={() => toggleItem.mutate({ id: item.id, completed: !item.completed })}
                    className="text-collins-600"
                  >
                    {item.completed ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-300" />
                    )}
                  </button>
                  <span
                    className={
                      item.completed
                        ? 'text-sm text-slate-400 line-through'
                        : 'text-sm text-slate-700'
                    }
                  >
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2">
            <Input
              aria-label="New action item"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add an action item…"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newItem.trim()) {
                  e.preventDefault();
                  addItem.mutate();
                }
              }}
            />
            <Button
              variant="outline"
              onClick={() => addItem.mutate()}
              disabled={!newItem.trim()}
              loading={addItem.isPending}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ----------------------------- Review cycles (HR) ---------------------- */

function CyclesTab() {
  const qc = useQueryClient();
  const { data: cycles, isLoading, isError, refetch } = useQuery({
    queryKey: ['performance', 'cycles'],
    queryFn: () => api.get<ReviewCycle[]>('/performance/cycles'),
  });
  const [createOpen, setCreateOpen] = useState(false);

  const enroll = useMutation({
    mutationFn: (id: string) =>
      api.post(`/performance/cycles/${id}/enroll`, { allWithManager: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['performance', 'cycles'] });
    },
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/performance/cycles/${id}`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['performance', 'cycles'] });
    },
  });

  if (isLoading) return <LoadingPage />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const list = cycles ?? [];

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
          New cycle
        </Button>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={Users}
              title="No review cycles"
              description="Create a review cycle and enrol employees to begin."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((c) => {
            const total = c.reviewCount ?? 0;
            const done = c.completedCount ?? 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <Card key={c.id}>
                <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <Badge tone={statusTone(c.status)}>{titleCase(c.status)}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(c.startDate)} – {formatDate(c.endDate)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {done}/{total} reviews completed ({pct}%)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => enroll.mutate(c.id)}
                      loading={enroll.isPending && enroll.variables === c.id}
                      disabled={c.status === 'closed'}
                    >
                      Enrol all
                    </Button>
                    {c.status !== 'closed' ? (
                      <Button
                        variant="outline"
                        onClick={() => setStatus.mutate({ id: c.id, status: 'closed' })}
                      >
                        Close
                      </Button>
                    ) : null}
                    {c.status === 'upcoming' ? (
                      <Button
                        variant="outline"
                        onClick={() => setStatus.mutate({ id: c.id, status: 'active' })}
                      >
                        Activate
                      </Button>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {enroll.isError ? (
        <p className="mt-3 text-sm text-red-600">Could not enrol employees.</p>
      ) : null}

      {createOpen ? <CycleModal onClose={() => setCreateOpen(false)} /> : null}
    </div>
  );
}

function CycleModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const mutation = useMutation({
    mutationFn: (input: CreateReviewCycleInput) => api.post('/performance/cycles', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['performance', 'cycles'] });
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({ name, startDate, endDate });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New review cycle"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="cycle-form"
            type="submit"
            loading={mutation.isPending}
            disabled={!name || !startDate || !endDate}
          >
            Create cycle
          </Button>
        </>
      }
    >
      <form id="cycle-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" htmlFor="cycle-name">
          <Input id="cycle-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" htmlFor="cycle-start">
            <Input
              id="cycle-start"
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="End date" htmlFor="cycle-end">
            <Input
              id="cycle-end"
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>
        {mutation.isError ? (
          <p className="text-sm text-red-600">
            Could not create the cycle. Check the dates and try again.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

/* ----------------------------- Shared ---------------------------------- */

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <CardBody>
        <div className="py-8 text-center">
          <p className="text-sm text-slate-600">Something went wrong loading this data.</p>
          <Button className="mt-3" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
