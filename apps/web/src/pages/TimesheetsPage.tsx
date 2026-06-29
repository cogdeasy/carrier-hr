import type {
  AttendanceSummary,
  Paginated,
  SaveTimesheetInput,
  Timesheet,
} from '@collins-hr/shared';
import { timesheetWeekDates } from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Plus, Send, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/ui/Avatar';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, Input, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Spinner } from '../components/ui/Spinner';
import { TBody, TD, TH, THead, TR, Table } from '../components/ui/Table';
import { ApiError, api } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';

function mondayOf(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function shiftWeek(weekStarting: string, weeks: number): string {
  const d = new Date(`${weekStarting}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function TimesheetsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'mine' | 'approvals'>('mine');
  const canApprove = can('timesheet:approve');

  return (
    <div>
      <PageHeader title="Timesheets" description="Log your hours, track attendance and approve your team." />

      {canApprove ? (
        <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist">
          <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
            My timesheets
          </TabButton>
          <TabButton active={tab === 'approvals'} onClick={() => setTab('approvals')}>
            Approvals
          </TabButton>
        </div>
      ) : null}

      {tab === 'mine' ? <MyTimesheets /> : <Approvals />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? 'rounded-md bg-collins-700 px-4 py-1.5 text-sm font-medium text-white'
          : 'rounded-md px-4 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900'
      }
    >
      {children}
    </button>
  );
}

interface DraftEntry {
  date: string;
  project: string;
  task: string;
  hours: string;
  notes: string;
}

function MyTimesheets() {
  const qc = useQueryClient();
  const [weekStarting, setWeekStarting] = useState(() => mondayOf(new Date()));
  const [draft, setDraft] = useState<DraftEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const weekDays = useMemo(() => timesheetWeekDates(weekStarting), [weekStarting]);

  const { data: week, isLoading, isError } = useQuery({
    queryKey: ['timesheets', 'week', weekStarting],
    queryFn: () => api.get<Timesheet>(`/timesheets/week/${weekStarting}`),
  });

  const { data: summary } = useQuery({
    queryKey: ['timesheets', 'summary'],
    queryFn: () => api.get<AttendanceSummary>('/timesheets/summary'),
  });

  const { data: history } = useQuery({
    queryKey: ['timesheets', 'history'],
    queryFn: () => api.get<Paginated<Timesheet>>('/timesheets', { pageSize: 8 }),
  });

  useEffect(() => {
    if (week) {
      setDraft(
        week.entries.map((e) => ({
          date: e.date,
          project: e.project,
          task: e.task ?? '',
          hours: String(e.hours),
          notes: e.notes ?? '',
        })),
      );
      setError(null);
    }
  }, [week]);

  const save = useMutation({
    mutationFn: (input: SaveTimesheetInput) => api.put<Timesheet>('/timesheets', input),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['timesheets'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to save timesheet'),
  });

  const submit = useMutation({
    mutationFn: (id: string) => api.post(`/timesheets/${id}/submit`),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['timesheets'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to submit timesheet'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-collins-700" />
      </div>
    );
  }

  if (isError || !week) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={Clock}
            title="Couldn't load your timesheet"
            description="Something went wrong. Please try again."
            action={
              <Button onClick={() => qc.invalidateQueries({ queryKey: ['timesheets', 'week'] })}>Retry</Button>
            }
          />
        </CardBody>
      </Card>
    );
  }

  const editable = week.status === 'draft' || week.status === 'rejected';
  const totalHours = draft.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  const overtime = Math.max(0, totalHours - 40);

  function buildInput(): SaveTimesheetInput {
    return {
      weekStarting,
      entries: draft
        .filter((e) => e.project && Number(e.hours) > 0)
        .map((e) => ({
          date: e.date,
          project: e.project,
          task: e.task || undefined,
          hours: Number(e.hours),
          notes: e.notes || undefined,
        })),
    };
  }

  function updateRow(i: number, patch: Partial<DraftEntry>) {
    setDraft((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total hours" value={summary?.totalHours ?? 0} icon={Clock} hint="across all weeks" />
        <StatCard label="Regular" value={summary?.regularHours ?? 0} hint="up to 40h / week" />
        <StatCard label="Overtime" value={summary?.overtimeHours ?? 0} hint="beyond 40h / week" />
        <StatCard label="Approved" value={summary?.approvedHours ?? 0} hint={`${summary?.approvedCount ?? 0} weeks`} />
      </div>

      <Card>
        <CardHeader
          title={`Week of ${formatDate(weekStarting)}`}
          subtitle={`${totalHours}h total${overtime > 0 ? ` · ${overtime}h overtime` : ''}`}
          action={<Badge tone={statusTone(week.status)}>{titleCase(week.status)}</Badge>}
        />
        <CardBody>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous week"
              onClick={() => setWeekStarting(shiftWeek(weekStarting, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              aria-label="Week starting"
              className="w-auto"
              value={weekStarting}
              onChange={(e) => e.target.value && setWeekStarting(mondayOf(new Date(e.target.value)))}
            />
            <Button
              variant="outline"
              size="sm"
              aria-label="Next week"
              onClick={() => setWeekStarting(shiftWeek(weekStarting, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {week.status === 'rejected' && week.decisionNote ? (
              <span className="ml-2 text-sm text-red-600">Returned: {week.decisionNote}</span>
            ) : null}
          </div>

          {draft.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No hours logged for this week"
              description={editable ? 'Add a row to start logging your time.' : 'This week has no entries.'}
            />
          ) : (
            <div className="space-y-2">
              <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-400 sm:grid">
                <span className="col-span-3">Day</span>
                <span className="col-span-3">Project</span>
                <span className="col-span-3">Task</span>
                <span className="col-span-2">Hours</span>
                <span className="col-span-1" />
              </div>
              {draft.map((entry, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <select
                    className="input col-span-3"
                    aria-label={`Day for row ${i + 1}`}
                    disabled={!editable}
                    value={entry.date}
                    onChange={(e) => updateRow(i, { date: e.target.value })}
                  >
                    {weekDays.map((day, idx) => (
                      <option key={day} value={day}>
                        {WEEKDAYS[idx]} {day.slice(5)}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="col-span-3"
                    placeholder="Project"
                    aria-label={`Project for row ${i + 1}`}
                    disabled={!editable}
                    value={entry.project}
                    onChange={(e) => updateRow(i, { project: e.target.value })}
                  />
                  <Input
                    className="col-span-3"
                    placeholder="Task (optional)"
                    aria-label={`Task for row ${i + 1}`}
                    disabled={!editable}
                    value={entry.task}
                    onChange={(e) => updateRow(i, { task: e.target.value })}
                  />
                  <Input
                    type="number"
                    className="col-span-2"
                    placeholder="Hours"
                    aria-label={`Hours for row ${i + 1}`}
                    min={0}
                    max={24}
                    step={0.5}
                    disabled={!editable}
                    value={entry.hours}
                    onChange={(e) => updateRow(i, { hours: e.target.value })}
                  />
                  <div className="col-span-1 flex items-center">
                    {editable ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove row ${i + 1}`}
                        onClick={() => setDraft(draft.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          {editable ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() =>
                  setDraft([...draft, { date: weekDays[0] ?? weekStarting, project: '', task: '', hours: '', notes: '' }])
                }
              >
                Add row
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" loading={save.isPending} onClick={() => save.mutate(buildInput())}>
                  Save draft
                </Button>
                <Button
                  leftIcon={<Send className="h-4 w-4" />}
                  loading={submit.isPending}
                  disabled={totalHours <= 0}
                  onClick={() => submit.mutate(week.id)}
                >
                  Submit
                </Button>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="History" subtitle="Your recent weeks" />
        <CardBody className="p-0">
          {!history || history.data.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={CalendarDays} title="No timesheets yet" description="Logged weeks will appear here." />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Week</TH>
                  <TH>Total</TH>
                  <TH>Overtime</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {history.data.map((t) => (
                  <TR
                    key={t.id}
                    onClick={() => setWeekStarting(t.weekStarting)}
                    className={t.weekStarting === weekStarting ? 'bg-collins-50' : undefined}
                  >
                    <TD className="font-medium text-slate-900">Week of {formatDate(t.weekStarting)}</TD>
                    <TD>{t.totalHours}h</TD>
                    <TD>{t.overtimeHours > 0 ? `${t.overtimeHours}h` : '—'}</TD>
                    <TD>
                      <Badge tone={statusTone(t.status)}>{titleCase(t.status)}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Approvals() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<Timesheet | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: queue = [], isLoading, isError } = useQuery({
    queryKey: ['timesheets', 'approvals'],
    queryFn: () => api.get<Timesheet[]>('/timesheets/approvals'),
  });

  function reset() {
    setSelected(new Set());
    void qc.invalidateQueries({ queryKey: ['timesheets'] });
  }

  const decide = useMutation({
    mutationFn: ({ id, decision, decisionNote }: { id: string; decision: 'approved' | 'rejected'; decisionNote?: string }) =>
      api.post(`/timesheets/${id}/decision`, { decision, decisionNote }),
    onSuccess: () => {
      setRejecting(null);
      setNote('');
      reset();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Action failed'),
  });

  const bulkApprove = useMutation({
    mutationFn: (ids: string[]) => api.post('/timesheets/approvals/bulk', { ids }),
    onSuccess: reset,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Bulk approval failed'),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6 text-collins-700" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardBody>
          <EmptyState icon={Clock} title="Couldn't load approvals" description="Please try again shortly." />
        </CardBody>
      </Card>
    );
  }

  if (queue.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState icon={Check} title="All caught up" description="No timesheets are awaiting your review." />
        </CardBody>
      </Card>
    );
  }

  const allSelected = selected.size === queue.length;

  return (
    <Card>
      <CardHeader
        title="Pending approvals"
        subtitle={`${queue.length} timesheet${queue.length === 1 ? '' : 's'} awaiting review`}
        action={
          <Button
            size="sm"
            leftIcon={<Check className="h-4 w-4" />}
            disabled={selected.size === 0}
            loading={bulkApprove.isPending}
            onClick={() => bulkApprove.mutate([...selected])}
          >
            Approve selected ({selected.size})
          </Button>
        }
      />
      <CardBody className="p-0">
        {error ? <p className="px-4 pt-3 text-sm text-red-600">{error}</p> : null}
        <Table>
          <THead>
            <TR>
              <TH>
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={(e) => setSelected(e.target.checked ? new Set(queue.map((t) => t.id)) : new Set())}
                />
              </TH>
              <TH>Employee</TH>
              <TH>Week</TH>
              <TH>Total</TH>
              <TH>Overtime</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {queue.map((t) => (
              <TR key={t.id}>
                <TD>
                  <input
                    type="checkbox"
                    aria-label={`Select ${t.employee?.displayName ?? 'timesheet'}`}
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                  />
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Avatar name={t.employee?.displayName ?? 'Employee'} src={t.employee?.avatarUrl} size="sm" />
                    <span className="font-medium text-slate-900">{t.employee?.displayName ?? '—'}</span>
                  </div>
                </TD>
                <TD>Week of {formatDate(t.weekStarting)}</TD>
                <TD>{t.totalHours}h</TD>
                <TD>{t.overtimeHours > 0 ? `${t.overtimeHours}h` : '—'}</TD>
                <TD>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<X className="h-4 w-4" />}
                      onClick={() => {
                        setError(null);
                        setRejecting(t);
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      leftIcon={<Check className="h-4 w-4" />}
                      onClick={() => decide.mutate({ id: t.id, decision: 'approved' })}
                    >
                      Approve
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardBody>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Reject timesheet"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              loading={decide.isPending}
              disabled={!note.trim()}
              onClick={() =>
                rejecting && decide.mutate({ id: rejecting.id, decision: 'rejected', decisionNote: note })
              }
            >
              Reject
            </Button>
          </>
        }
      >
        <Field label="Reason for rejection" htmlFor="reject-note">
          <Textarea
            id="reject-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain what needs to change before resubmission."
          />
        </Field>
      </Modal>
    </Card>
  );
}
