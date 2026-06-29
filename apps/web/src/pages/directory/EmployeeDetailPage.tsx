import type { Employee, EmployeeRef } from '@collins-hr/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Mail, MapPin, Phone } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { LoadingPage } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { formatDate, titleCase } from '../../lib/format';

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api.get<Employee>(`/employees/${id}`),
    enabled: Boolean(id),
  });

  const { data: reports = [] } = useQuery({
    queryKey: ['employee', id, 'reports'],
    queryFn: () => api.get<EmployeeRef[]>(`/employees/${id}/reports`),
    enabled: Boolean(id),
  });

  const { data: manager } = useQuery({
    queryKey: ['employee', employee?.managerId],
    queryFn: () => api.get<Employee>(`/employees/${employee?.managerId}`),
    enabled: Boolean(employee?.managerId),
  });

  if (isLoading || !employee) return <LoadingPage />;

  return (
    <div>
      <Link
        to="/directory"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to directory
      </Link>

      <Card className="mb-6">
        <CardBody className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <Avatar name={employee.displayName} src={employee.avatarUrl} size="lg" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{employee.displayName}</h1>
              <Badge tone={statusTone(employee.status)}>{titleCase(employee.status)}</Badge>
            </div>
            <p className="text-slate-600">{employee.jobTitle}</p>
            <p className="text-sm text-slate-400">
              {employee.department} · {employee.division}
            </p>
          </div>
          <div className="text-sm text-slate-500">
            <p className="font-medium text-slate-700">#{employee.employeeNumber}</p>
            <p>Joined {formatDate(employee.hireDate)}</p>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Contact & details" />
          <CardBody>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail icon={<Mail className="h-4 w-4" />} label="Email" value={employee.email} />
              <Detail
                icon={<Phone className="h-4 w-4" />}
                label="Work phone"
                value={employee.workPhone ?? '—'}
              />
              <Detail
                icon={<MapPin className="h-4 w-4" />}
                label="Location"
                value={employee.location}
              />
              <Detail label="Employment type" value={titleCase(employee.employmentType)} />
              <Detail label="Division" value={employee.division} />
              <Detail label="Manager" value={manager?.displayName ?? 'None'} />
            </dl>
            {employee.address ? (
              <div className="mt-6 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Address
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {employee.address.line1}
                  {employee.address.line2 ? `, ${employee.address.line2}` : ''}, {employee.address.city},{' '}
                  {employee.address.state} {employee.address.postalCode}, {employee.address.country}
                </p>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Direct reports" subtitle={`${reports.length} team member${reports.length === 1 ? '' : 's'}`} />
          <CardBody className="p-0">
            {reports.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">No direct reports.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/directory/${r.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                    >
                      <Avatar name={r.displayName} src={r.avatarUrl} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{r.displayName}</p>
                        <p className="text-xs text-slate-500">{r.jobTitle}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-700">{value}</dd>
    </div>
  );
}
