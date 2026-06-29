import type {
  CreateTimeOffInput,
  TimeOffBalance,
  TimeOffRequest,
} from '@carrier-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, Plus, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { ApiError, api } from '../../lib/api';
import { formatDate, titleCase } from '../../lib/format';

const TYPE_LABELS: Record<string, string> = {
  vacation: 'Vacation',
  sick: 'Sick',
  personal: 'Personal',
  bereavement: 'Bereavement',
  jury_duty: 'Jury duty',
  parental: 'Parental',
  unpaid: 'Unpaid',
};

export function TimeOffPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'mine' | 'approvals'>('mine');

  return (
    <div>
      <PageHeader title="Time Off" description="Request leave and track your balances." />

      {can('timeoff:approve') ? (
        <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1">
          <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
            My time off
          </TabButton>
          <TabButton active={tab === 'approvals'} onClick={() => setTab('approvals')}>
            Approvals
          </TabButton>
        </div>
      ) : null}

      {tab === 'mine' ? <MyTimeOff /> : <Approvals />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'rounded-md bg-carrier-700 px-4 py-1.5 text-sm font-medium text-white'
          : 'rounded-md px-4 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900'
      }
    >
      {children}
    </button>
  );
}

function MyTimeOff() {
  const [requestOpen, setRequestOpen] = useState(false);
  const qc = useQueryClient();

  const { data: balances = [] } = useQuery({
    queryKey: ['timeoff', 'balances'],
    queryFn: () => api.get<TimeOffBalance[]>('/time-off/balances'),
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['timeoff', 'requests'],
    queryFn: () => api.get<TimeOffRequest[]>('/time-off/requests'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/time-off/requests/${id}/cancel`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timeoff'] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {balances.map((b) => (
          <Card key={b.type} className="p-4">
            <p className="text-sm font-medium text-slate-500">{TYPE_LABELS[b.type] ?? titleCase(b.type)}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{b.availableDays}</p>
            <p className="text-xs text-slate-400">
              days available · {b.usedDays} used{b.pendingDays > 0 ? ` · ${b.pendingDays} pending` : ''}
            </p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader
          title="My requests"
          action={
            <Button leftIcon={<Plus className="h-4 w-4" />} size="sm" onClick={() => setRequestOpen(true)}>
              New request
            </Button>
          }
        />
        <CardBody className="p-0">
          {requests.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CalendarDays}
                title="No time-off requests yet"
                description="Submit your first request to get started."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Type</TH>
                  <TH>Dates</TH>
                  <TH>Days</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {requests.map((r) => (
                  <TR key={r.id}>
                    <TD>{TYPE_LABELS[r.type] ?? titleCase(r.type)}</TD>
                    <TD>
                      {formatDate(r.startDate)} – {formatDate(r.endDate)}
                    </TD>
                    <TD>{r.totalDays}</TD>
                    <TD>
                      <Badge tone={statusTone(r.status)}>{titleCase(r.status)}</Badge>
                    </TD>
                    <TD className="text-right">
                      {r.status === 'pending' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(r.id)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <RequestModal open={requestOpen} onClose={() => setRequestOpen(false)} />
    </div>
  );
}

function RequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState('vacation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: CreateTimeOffInput) => api.post('/time-off/requests', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timeoff'] });
      setStartDate('');
      setEndDate('');
      setReason('');
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to submit request'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      type: type as CreateTimeOffInput['type'],
      startDate,
      endDate,
      reason: reason || undefined,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request time off"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="timeoff-form" type="submit" loading={mutation.isPending}>
            Submit request
          </Button>
        </>
      }
    >
      <form id="timeoff-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date">
            <Input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason (optional)">
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}

function Approvals() {
  const qc = useQueryClient();
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['timeoff', 'approvals'],
    queryFn: () => api.get<TimeOffRequest[]>('/time-off/approvals'),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) =>
      api.post(`/time-off/requests/${id}/decision`, { decision }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timeoff', 'approvals'] });
    },
  });

  if (!isLoading && requests.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState icon={Check} title="All caught up" description="No pending requests to review." />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Pending approvals" subtitle="Requests awaiting your decision" />
      <CardBody className="p-0">
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH>
              <TH>Type</TH>
              <TH>Dates</TH>
              <TH>Days</TH>
              <TH>Reason</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {requests.map((r) => (
              <TR key={r.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    <Avatar name={r.employee?.displayName ?? 'Employee'} src={r.employee?.avatarUrl} size="sm" />
                    <span className="font-medium text-slate-900">{r.employee?.displayName ?? '—'}</span>
                  </div>
                </TD>
                <TD>{TYPE_LABELS[r.type] ?? titleCase(r.type)}</TD>
                <TD>
                  {formatDate(r.startDate)} – {formatDate(r.endDate)}
                </TD>
                <TD>{r.totalDays}</TD>
                <TD className="max-w-xs truncate text-slate-500">{r.reason ?? '—'}</TD>
                <TD>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<X className="h-4 w-4" />}
                      onClick={() => decide.mutate({ id: r.id, decision: 'rejected' })}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      leftIcon={<Check className="h-4 w-4" />}
                      onClick={() => decide.mutate({ id: r.id, decision: 'approved' })}
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
    </Card>
  );
}
