import type { Compensation, Payslip } from '@carrier-hr/shared';
import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { useState } from 'react';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { LoadingPage } from '../components/ui/Spinner';
import { TBody, TD, TH, THead, TR, Table } from '../components/ui/Table';
import { api } from '../lib/api';
import { formatCents, formatDate, titleCase } from '../lib/format';

export function PayrollPage() {
  const [selected, setSelected] = useState<Payslip | null>(null);

  const { data: comp } = useQuery({
    queryKey: ['payroll', 'compensation'],
    queryFn: () => api.get<Compensation>('/payroll/compensation'),
  });

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ['payroll', 'payslips'],
    queryFn: () => api.get<Payslip[]>('/payroll/payslips'),
  });

  if (isLoading) return <LoadingPage />;

  return (
    <div>
      <PageHeader title="Payroll" description="View your compensation and payslips." />

      {comp ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Annual salary"
            value={formatCents(comp.annualSalaryCents)}
            icon={Wallet}
          />
          <StatCard label="Pay frequency" value={titleCase(comp.payFrequency)} />
          <StatCard label="Effective" value={formatDate(comp.effectiveDate)} />
        </div>
      ) : null}

      <Card>
        <CardHeader title="Payslips" subtitle="Your recent pay statements" />
        <CardBody className="p-0">
          {payslips.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Wallet} title="No payslips yet" />
            </div>
          ) : (
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
                  <TR key={p.id}>
                    <TD className="font-medium text-slate-900">{formatDate(p.payDate)}</TD>
                    <TD>
                      {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    </TD>
                    <TD>{formatCents(p.grossCents)}</TD>
                    <TD className="font-medium">{formatCents(p.netCents)}</TD>
                    <TD>
                      <Badge tone={statusTone(p.status)}>{titleCase(p.status)}</Badge>
                    </TD>
                    <TD className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(p)}>
                        View
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Payslip · ${formatDate(selected.payDate)}` : ''}
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-slate-500">
              <span>
                {formatDate(selected.periodStart)} – {formatDate(selected.periodEnd)}
              </span>
              <Badge tone={statusTone(selected.status)}>{titleCase(selected.status)}</Badge>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {selected.lines.map((line, i) => (
                  <tr key={i}>
                    <td className="py-2 text-slate-600">{line.label}</td>
                    <td className="py-2 text-right text-xs uppercase text-slate-400">{line.type}</td>
                    <td
                      className={
                        line.type === 'earning'
                          ? 'py-2 text-right font-medium text-emerald-600'
                          : 'py-2 text-right font-medium text-slate-700'
                      }
                    >
                      {line.type === 'earning' ? '' : '−'}
                      {formatCents(Math.abs(line.amountCents))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 border-t border-slate-200 pt-3 text-sm">
              <Row label="Gross" value={formatCents(selected.grossCents)} />
              <Row label="Taxes" value={`−${formatCents(selected.totalTaxCents)}`} />
              <Row label="Deductions" value={`−${formatCents(selected.totalDeductionsCents)}`} />
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                <span>Net pay</span>
                <span>{formatCents(selected.netCents)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-slate-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
