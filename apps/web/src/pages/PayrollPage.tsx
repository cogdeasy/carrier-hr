import type {
  Compensation,
  GeneratePayRunInput,
  PayRun,
  PayRunDetail,
  PayRunList,
  Payslip,
  PayslipList,
  PayslipStatus,
  YtdSummary,
} from '@collins-hr/shared';
import { PAY_FREQUENCIES, PAYSLIP_STATUSES } from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Printer, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, Input, Select } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Spinner } from '../components/ui/Spinner';
import { StatCard } from '../components/ui/StatCard';
import { TBody, TD, TH, THead, TR, Table } from '../components/ui/Table';
import { ApiError, api } from '../lib/api';
import { formatCents, formatDate, titleCase } from '../lib/format';

const PAYSLIP_TONES: Record<PayslipStatus, BadgeTone> = {
  draft: 'neutral',
  issued: 'info',
  paid: 'success',
};

function payslipTone(status: string): BadgeTone {
  return PAYSLIP_TONES[status as PayslipStatus] ?? 'neutral';
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}

const PAGE_SIZE = 10;

export function PayrollPage() {
  const { can } = useAuth();
  const isAdmin = can('payroll:admin');
  const [tab, setTab] = useState<'mine' | 'runs'>('mine');

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="View your compensation, payslips and year-to-date earnings."
      />

      {isAdmin ? (
        <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-white p-1" role="tablist">
          <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
            My payslips
          </TabButton>
          <TabButton active={tab === 'runs'} onClick={() => setTab('runs')}>
            Pay runs
          </TabButton>
        </div>
      ) : null}

      {tab === 'mine' ? <EmployeePayroll /> : <PayRunsAdmin />}
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? 'rounded-md bg-collins-700 px-4 py-1.5 text-sm font-medium text-white'
          : 'rounded-md px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100'
      }
    >
      {children}
    </button>
  );
}

function EmployeePayroll() {
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(currentYear);
  const [status, setStatus] = useState<'' | PayslipStatus>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Payslip | null>(null);

  const { data: comp } = useQuery({
    queryKey: ['payroll', 'compensation'],
    queryFn: () => api.get<Compensation>('/payroll/compensation'),
  });

  const { data: ytd } = useQuery({
    queryKey: ['payroll', 'ytd', year],
    queryFn: () => api.get<YtdSummary>('/payroll/ytd', { year }),
  });

  const {
    data: list,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['payroll', 'payslips', { year, status, page }],
    queryFn: () =>
      api.get<PayslipList>('/payroll/payslips', {
        year,
        status: status || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const payslips = list?.data ?? [];

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Annual salary"
          value={comp ? formatCents(comp.annualSalaryCents) : '—'}
          icon={Wallet}
          hint={comp ? `${titleCase(comp.payFrequency)} · effective ${formatDate(comp.effectiveDate)}` : undefined}
        />
        <StatCard label={`${year} gross`} value={ytd ? formatCents(ytd.grossCents) : '—'} />
        <StatCard label={`${year} net`} value={ytd ? formatCents(ytd.netCents) : '—'} />
        <StatCard
          label={`${year} taxes`}
          value={ytd ? formatCents(ytd.totalTaxCents) : '—'}
          hint={ytd ? `${ytd.payslipCount} payslip${ytd.payslipCount === 1 ? '' : 's'}` : undefined}
        />
      </div>

      <Card>
        <CardHeader
          title="Payslips"
          subtitle="Your recent pay statements"
          action={
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="payslip-year">
                Year
              </label>
              <Select
                id="payslip-year"
                className="h-8 w-auto py-0 text-sm"
                value={year}
                onChange={(e) => {
                  setYear(Number(e.target.value));
                  setPage(1);
                }}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              <label className="sr-only" htmlFor="payslip-status">
                Status
              </label>
              <Select
                id="payslip-status"
                className="h-8 w-auto py-0 text-sm"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as '' | PayslipStatus);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {PAYSLIP_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="h-8 w-8" />
            </div>
          ) : isError ? (
            <div className="p-6">
              <EmptyState
                icon={Wallet}
                title="Could not load payslips"
                description={errorMessage(error)}
                action={
                  <Button variant="outline" onClick={() => void refetch()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : payslips.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Wallet}
                title="No payslips yet"
                description={`No pay statements found for ${year}.`}
              />
            </div>
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Pay date</TH>
                    <TH>Period</TH>
                    <TH>Gross</TH>
                    <TH>Net</TH>
                    <TH>Status</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {payslips.map((p) => (
                    <TR key={p.id} onClick={() => setSelected(p)}>
                      <TD className="font-medium text-slate-900">{formatDate(p.payDate)}</TD>
                      <TD>
                        {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                      </TD>
                      <TD>{formatCents(p.grossCents)}</TD>
                      <TD className="font-medium">{formatCents(p.netCents)}</TD>
                      <TD>
                        <Badge tone={payslipTone(p.status)}>{titleCase(p.status)}</Badge>
                      </TD>
                      <TD className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(p);
                          }}
                        >
                          View
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {list ? <Pagination list={list} onPage={setPage} /> : null}
            </>
          )}
        </CardBody>
      </Card>

      <PayslipModal payslip={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Pagination({
  list,
  onPage,
}: {
  list: { page: number; totalPages: number; total: number };
  onPage: (page: number) => void;
}) {
  if (list.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
      <span>
        Page {list.page} of {list.totalPages} · {list.total} total
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={list.page <= 1}
          onClick={() => onPage(list.page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={list.page >= list.totalPages}
          onClick={() => onPage(list.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function PayslipModal({ payslip, onClose }: { payslip: Payslip | null; onClose: () => void }) {
  const earnings = payslip?.lines.filter((l) => l.type === 'earning') ?? [];
  const taxes = payslip?.lines.filter((l) => l.type === 'tax') ?? [];
  const deductions = payslip?.lines.filter((l) => l.type === 'deduction') ?? [];
  const contributions = payslip?.lines.filter((l) => l.type === 'contribution') ?? [];

  return (
    <Modal
      open={payslip !== null}
      onClose={onClose}
      title={payslip ? `Payslip · ${formatDate(payslip.payDate)}` : ''}
      footer={
        payslip ? (
          <Button variant="outline" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Print
          </Button>
        ) : null
      }
    >
      {payslip ? (
        <div className="space-y-4">
          {payslip.employee ? (
            <p className="text-sm font-medium text-slate-900">{payslip.employee.displayName}</p>
          ) : null}
          <div className="flex justify-between text-sm text-slate-500">
            <span>
              {formatDate(payslip.periodStart)} – {formatDate(payslip.periodEnd)} ·{' '}
              {titleCase(payslip.frequency)}
            </span>
            <Badge tone={payslipTone(payslip.status)}>{titleCase(payslip.status)}</Badge>
          </div>

          <LineSection title="Earnings" lines={earnings} positive />
          <LineSection title="Taxes" lines={taxes} />
          <LineSection title="Deductions" lines={deductions} />
          {contributions.length ? (
            <LineSection
              title="Employer contributions"
              lines={contributions}
              note="Paid by Collins Aerospace — not deducted from your net pay."
            />
          ) : null}

          <div className="space-y-1 border-t border-slate-200 pt-3 text-sm">
            <SummaryRow label="Gross" value={formatCents(payslip.grossCents)} />
            <SummaryRow label="Taxes" value={`−${formatCents(payslip.totalTaxCents)}`} />
            <SummaryRow label="Deductions" value={`−${formatCents(payslip.totalDeductionsCents)}`} />
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
              <span>Net pay</span>
              <span>{formatCents(payslip.netCents)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function LineSection({
  title,
  lines,
  positive,
  note,
}: {
  title: string;
  lines: { label: string; amountCents: number }[];
  positive?: boolean;
  note?: string;
}) {
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {lines.map((line, i) => (
            <tr key={i}>
              <td className="py-1.5 text-slate-600">{line.label}</td>
              <td
                className={
                  positive
                    ? 'py-1.5 text-right font-medium text-emerald-600'
                    : 'py-1.5 text-right font-medium text-slate-700'
                }
              >
                {positive ? '' : '−'}
                {formatCents(line.amountCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note ? <p className="mt-1 text-xs text-slate-400">{note}</p> : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function PayRunsAdmin() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ['payroll', 'pay-runs'],
    queryFn: () => api.get<PayRunList>('/payroll/pay-runs'),
  });

  const runs = list?.data ?? [];

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button leftIcon={<Calculator className="h-4 w-4" />} onClick={() => setShowForm(true)}>
          Run payroll
        </Button>
      </div>

      <Card>
        <CardHeader title="Pay runs" subtitle="Generate and reconcile pay runs across the company" />
        <CardBody className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="h-8 w-8" />
            </div>
          ) : runs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Calculator}
                title="No pay runs yet"
                description="Run payroll to generate payslips for a pay period."
                action={<Button onClick={() => setShowForm(true)}>Run payroll</Button>}
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Pay date</TH>
                  <TH>Period</TH>
                  <TH>Frequency</TH>
                  <TH>Employees</TH>
                  <TH>Gross</TH>
                  <TH>Net</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {runs.map((r) => (
                  <TR key={r.id} onClick={() => setOpenRunId(r.id)}>
                    <TD className="font-medium text-slate-900">{formatDate(r.payDate)}</TD>
                    <TD>
                      {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}
                    </TD>
                    <TD>{titleCase(r.frequency)}</TD>
                    <TD>{r.payslipCount}</TD>
                    <TD>{formatCents(r.totalGrossCents)}</TD>
                    <TD className="font-medium">{formatCents(r.totalNetCents)}</TD>
                    <TD>
                      <Badge tone={payslipTone(r.status)}>{titleCase(r.status)}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {showForm ? (
        <GeneratePayRunModal
          onClose={() => setShowForm(false)}
          onCreated={(run) => {
            setShowForm(false);
            void qc.invalidateQueries({ queryKey: ['payroll', 'pay-runs'] });
            setOpenRunId(run.id);
          }}
        />
      ) : null}

      <PayRunDetailModal runId={openRunId} onClose={() => setOpenRunId(null)} />
    </div>
  );
}

function GeneratePayRunModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (run: PayRun) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<GeneratePayRunInput>({
    periodStart: today,
    periodEnd: today,
    payDate: today,
    frequency: 'biweekly',
  });

  const generate = useMutation({
    mutationFn: (input: GeneratePayRunInput) => api.post<PayRun>('/payroll/pay-runs', input),
    onSuccess: onCreated,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Run payroll"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={generate.isPending} onClick={() => generate.mutate(form)}>
            Generate payslips
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Generates an issued payslip for every active employee with a compensation record. Employees
          already paid for this period are skipped.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Period start" htmlFor="run-start">
            <Input
              id="run-start"
              type="date"
              value={form.periodStart}
              onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
            />
          </Field>
          <Field label="Period end" htmlFor="run-end">
            <Input
              id="run-end"
              type="date"
              value={form.periodEnd}
              onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
            />
          </Field>
          <Field label="Pay date" htmlFor="run-paydate">
            <Input
              id="run-paydate"
              type="date"
              value={form.payDate}
              onChange={(e) => setForm({ ...form, payDate: e.target.value })}
            />
          </Field>
          <Field label="Frequency" htmlFor="run-frequency">
            <Select
              id="run-frequency"
              value={form.frequency}
              onChange={(e) =>
                setForm({ ...form, frequency: e.target.value as GeneratePayRunInput['frequency'] })
              }
            >
              {PAY_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {titleCase(f)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {generate.isError ? (
          <p className="text-sm text-red-600">{errorMessage(generate.error)}</p>
        ) : null}
      </div>
    </Modal>
  );
}

function PayRunDetailModal({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();

  const { data: run, isLoading } = useQuery({
    queryKey: ['payroll', 'pay-run', runId],
    queryFn: () => api.get<PayRunDetail>(`/payroll/pay-runs/${runId}`),
    enabled: runId !== null,
  });

  const markPaid = useMutation({
    mutationFn: () => api.post<PayRunDetail>(`/payroll/pay-runs/${runId}/pay`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payroll', 'pay-run', runId] });
      void qc.invalidateQueries({ queryKey: ['payroll', 'pay-runs'] });
    },
  });

  return (
    <Modal
      open={runId !== null}
      onClose={onClose}
      title={run ? `Pay run · ${formatDate(run.payDate)}` : 'Pay run'}
      footer={
        run && can('payroll:admin') && run.status !== 'paid' ? (
          <Button loading={markPaid.isPending} onClick={() => markPaid.mutate()}>
            Mark all paid
          </Button>
        ) : null
      }
    >
      {isLoading || !run ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-7 w-7" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {formatDate(run.periodStart)} – {formatDate(run.periodEnd)} · {titleCase(run.frequency)}
            </span>
            <Badge tone={payslipTone(run.status)}>{titleCase(run.status)}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="Employees" value={String(run.payslipCount)} />
            <Stat label="Gross" value={formatCents(run.totalGrossCents)} />
            <Stat label="Net" value={formatCents(run.totalNetCents)} />
          </div>
          {markPaid.isError ? (
            <p className="text-sm text-red-600">{errorMessage(markPaid.error)}</p>
          ) : null}
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-100">
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Net</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {run.payslips.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium text-slate-900">
                      {p.employee?.displayName ?? p.employeeId}
                    </TD>
                    <TD>{formatCents(p.netCents)}</TD>
                    <TD>
                      <Badge tone={payslipTone(p.status)}>{titleCase(p.status)}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
