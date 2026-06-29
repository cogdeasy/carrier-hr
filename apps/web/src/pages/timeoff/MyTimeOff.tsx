import type {
  CompanyHoliday,
  CreateTimeOffInput,
  Paginated,
  TimeOffBalance,
  TimeOffPolicy,
  TimeOffRequest,
  TimeOffType,
} from '@collins-hr/shared';
import { REQUEST_STATUSES } from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus } from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { TYPE_OPTIONS, isAccrual, typeLabel, workingDaysBetween } from './constants';

const PAGE_SIZE = 8;

export function MyTimeOff() {
  const [requestOpen, setRequestOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const { data: balances = [], isLoading: balancesLoading } = useQuery({
    queryKey: ['timeoff', 'balances'],
    queryFn: () => api.get<TimeOffBalance[]>('/time-off/balances'),
  });

  const requestsQuery = useQuery({
    queryKey: ['timeoff', 'requests', { statusFilter, typeFilter, page }],
    queryFn: () =>
      api.get<Paginated<TimeOffRequest>>('/time-off/requests', {
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
      }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/time-off/requests/${id}/cancel`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['timeoff'] }),
  });

  const requests = requestsQuery.data?.data ?? [];
  const totalPages = requestsQuery.data?.totalPages ?? 1;
  const accrualBalances = balances.filter((b) => isAccrual(b.type));

  return (
    <div className="space-y-6">
      <section aria-label="Leave balances">
        {balancesLoading ? (
          <div className="flex h-28 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accrualBalances.map((b) => (
              <BalanceCard key={b.type} balance={b} />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader
          title="My requests"
          subtitle="Your leave history and pending requests"
          action={
            <Button leftIcon={<Plus className="h-4 w-4" />} size="sm" onClick={() => setRequestOpen(true)}>
              New request
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Field label="Status" htmlFor="status-filter">
              <Select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {REQUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0]?.toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type" htmlFor="type-filter">
              <Select
                id="type-filter"
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All types</option>
                {TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {requestsQuery.isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Spinner />
            </div>
          ) : requestsQuery.isError ? (
            <EmptyState
              icon={CalendarDays}
              title="Couldn't load your requests"
              description="Please try again in a moment."
            />
          ) : requests.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No time-off requests"
              description={
                statusFilter || typeFilter
                  ? 'No requests match the selected filters.'
                  : 'Submit your first request to get started.'
              }
            />
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Type</TH>
                    <TH>Dates</TH>
                    <TH>Days</TH>
                    <TH>Status</TH>
                    <TH>Note</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {requests.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-medium text-slate-900">{typeLabel(r.type)}</TD>
                      <TD>
                        {formatDate(r.startDate)} – {formatDate(r.endDate)}
                      </TD>
                      <TD>{r.totalDays}</TD>
                      <TD>
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                      </TD>
                      <TD className="max-w-xs truncate text-slate-500">
                        {r.decisionNote ?? r.reason ?? '—'}
                      </TD>
                      <TD className="text-right">
                        {r.status === 'pending' || (r.status === 'approved' && r.startDate > today()) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={cancelMutation.isPending && cancelMutation.variables === r.id}
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
              {totalPages > 1 ? (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm text-slate-500">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>

      <RequestModal open={requestOpen} onClose={() => setRequestOpen(false)} balances={balances} />
    </div>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function BalanceCard({ balance }: { balance: TimeOffBalance }) {
  const pct = balance.accruedDays > 0 ? Math.min(100, (balance.usedDays / balance.accruedDays) * 100) : 0;
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-slate-500">{typeLabel(balance.type)}</p>
        <p className="text-2xl font-bold text-slate-900">{balance.availableDays}</p>
      </div>
      <p className="text-xs text-slate-400">days available</p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="h-full rounded-full bg-collins-600" style={{ width: `${pct}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <dt className="text-slate-400">Accrued</dt>
          <dd className="font-semibold text-slate-700">{balance.accruedDays}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Used</dt>
          <dd className="font-semibold text-slate-700">{balance.usedDays}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Pending</dt>
          <dd className="font-semibold text-amber-600">{balance.pendingDays}</dd>
        </div>
      </dl>
      {balance.carryoverEligibleDays > 0 ? (
        <p className="mt-2 text-xs text-slate-400">
          {balance.carryoverEligibleDays} day(s) eligible to carry over
        </p>
      ) : null}
    </Card>
  );
}

function RequestModal({
  open,
  onClose,
  balances,
}: {
  open: boolean;
  onClose: () => void;
  balances: TimeOffBalance[];
}) {
  const qc = useQueryClient();
  const [type, setType] = useState<TimeOffType>('vacation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: holidays = [] } = useQuery({
    queryKey: ['timeoff', 'holidays'],
    queryFn: () => api.get<CompanyHoliday[]>('/time-off/holidays'),
  });
  const { data: policies = [] } = useQuery({
    queryKey: ['timeoff', 'policies'],
    queryFn: () => api.get<TimeOffPolicy[]>('/time-off/policies'),
  });

  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);
  const previewDays = workingDaysBetween(startDate, endDate, holidaySet);
  const balance = balances.find((b) => b.type === type);
  const policy = policies.find((p) => p.type === type);
  const overBalance =
    isAccrual(type) && balance != null && previewDays > balance.availableDays;

  const mutation = useMutation({
    mutationFn: (input: CreateTimeOffInput) => api.post('/time-off/requests', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['timeoff'] });
      reset();
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to submit request'),
  });

  function reset() {
    setStartDate('');
    setEndDate('');
    setReason('');
    setAttachmentUrl('');
    setError(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      type,
      startDate,
      endDate,
      reason: reason || undefined,
      attachmentUrl: attachmentUrl || undefined,
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
          <Button form="timeoff-form" type="submit" loading={mutation.isPending} disabled={overBalance}>
            Submit request
          </Button>
        </>
      }
    >
      <form id="timeoff-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Type" htmlFor="to-type">
          <Select id="to-type" value={type} onChange={(e) => setType(e.target.value as TimeOffType)}>
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" htmlFor="to-start">
            <Input
              id="to-start"
              type="date"
              required
              value={startDate}
              max={endDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="End date" htmlFor="to-end">
            <Input
              id="to-end"
              type="date"
              required
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>

        {startDate && endDate ? (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-700">
              {previewDays} working day(s)
              <span className="font-normal text-slate-400"> · weekends and holidays excluded</span>
            </p>
            {isAccrual(type) && balance ? (
              <p className={overBalance ? 'text-red-600' : 'text-slate-500'}>
                {balance.availableDays} day(s) available
                {overBalance ? ' — exceeds your balance' : ''}
              </p>
            ) : (
              <p className="text-slate-500">No balance required for this leave type.</p>
            )}
            {policy && !policy.accrual ? (
              <p className="text-xs text-slate-400">This leave type does not draw down an accrual balance.</p>
            ) : null}
          </div>
        ) : null}

        <Field label="Reason (optional)" htmlFor="to-reason">
          <Textarea
            id="to-reason"
            rows={3}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Field label="Attachment URL (optional)" htmlFor="to-attachment">
          <Input
            id="to-attachment"
            type="url"
            placeholder="https://…"
            value={attachmentUrl}
            onChange={(e) => setAttachmentUrl(e.target.value)}
          />
        </Field>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
