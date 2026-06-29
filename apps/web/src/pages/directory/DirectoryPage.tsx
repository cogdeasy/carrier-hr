import type { CreateEmployeeInput, Employee, Paginated } from '@carrier-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Users } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, Input, Select } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Spinner } from '../../components/ui/Spinner';
import { TBody, TD, TH, THead, TR, Table } from '../../components/ui/Table';
import { ApiError, api } from '../../lib/api';
import { titleCase } from '../../lib/format';

const DEPARTMENTS = [
  'Engineering',
  'Sales',
  'Marketing',
  'Finance',
  'Human Resources',
  'Operations',
  'Customer Success',
  'Legal',
  'IT',
  'Supply Chain',
  'Research & Development',
  'Executive',
];

export function DirectoryPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['employees', { search, department, status, page }],
    queryFn: () =>
      api.get<Paginated<Employee>>('/employees', {
        search: search || undefined,
        department: department || undefined,
        status: status || undefined,
        page,
        pageSize: 15,
      }),
  });

  return (
    <div>
      <PageHeader
        title="Employee Directory"
        description="Find and connect with people across Carrier."
        actions={
          can('employee:write') ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Add employee
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search by name, title, email…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="on_leave">On leave</option>
            <option value="terminated">Terminated</option>
            <option value="pre_start">Pre-start</option>
          </Select>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-8 w-8" />
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Users} title="No employees found" description="Try adjusting your filters." />
          </div>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Title</TH>
                  <TH>Department</TH>
                  <TH>Location</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {data.data.map((emp) => (
                  <TR key={emp.id} onClick={() => navigate(`/directory/${emp.id}`)}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={emp.displayName} src={emp.avatarUrl} size="sm" />
                        <div>
                          <p className="font-medium text-slate-900">{emp.displayName}</p>
                          <p className="text-xs text-slate-500">{emp.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD>{emp.jobTitle}</TD>
                    <TD>{emp.department}</TD>
                    <TD>{emp.location}</TD>
                    <TD>
                      <Badge tone={statusTone(emp.status)}>{titleCase(emp.status)}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
              <span>
                {data.total} {data.total === 1 ? 'person' : 'people'}
                {isFetching ? ' · updating…' : ''}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span>
                  Page {data.page} of {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <CreateEmployeeModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function CreateEmployeeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    jobTitle: '',
    department: 'Engineering',
    division: 'Carrier',
    location: 'Palm Beach Gardens, FL',
    employmentType: 'full_time',
    hireDate: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; temporaryPassword: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (input: CreateEmployeeInput) =>
      api.post<Employee & { temporaryPassword: string }>('/employees', input),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['employees'] });
      setResult({
        name: `${created.firstName} ${created.lastName}`,
        temporaryPassword: created.temporaryPassword,
      });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create employee'),
  });

  function handleClose() {
    setResult(null);
    setError(null);
    onClose();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      ...form,
      employmentType: form.employmentType as CreateEmployeeInput['employmentType'],
      roles: ['employee'],
    });
  }

  if (result) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Employee created"
        footer={
          <Button onClick={handleClose}>Done</Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {result.name}&rsquo;s account is ready. Share this one-time temporary password securely
            — it won&rsquo;t be shown again, and they must change it at first sign-in.
          </p>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm">
            {result.temporaryPassword}
          </div>
          <button
            type="button"
            className="text-sm text-sky-600 hover:text-sky-700"
            onClick={() => void navigator.clipboard?.writeText(result.temporaryPassword)}
          >
            Copy password
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add employee"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button form="create-employee-form" type="submit" loading={mutation.isPending}>
            Create
          </Button>
        </>
      }
    >
      <form id="create-employee-form" onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <Input
              required
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </Field>
          <Field label="Last name">
            <Input
              required
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Work email">
          <Input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Job title">
          <Input
            required
            value={form.jobTitle}
            onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department">
            <Select
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Employment type">
            <Select
              value={form.employmentType}
              onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
            >
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
              <option value="contractor">Contractor</option>
              <option value="intern">Intern</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location">
            <Input
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </Field>
          <Field label="Hire date">
            <Input
              type="date"
              required
              value={form.hireDate}
              onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
            />
          </Field>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}
