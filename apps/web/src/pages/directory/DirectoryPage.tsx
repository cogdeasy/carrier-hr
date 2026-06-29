import type {
  CreateEmployeeInput,
  Employee,
  EmployeeSortField,
  Paginated,
  SortDirection,
} from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronsUpDown, Plus, Search, Users, X } from 'lucide-react';
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
  'Executive',
  'Human Resources',
  'Engineering',
  'Product',
  'Sales',
  'Marketing',
  'Finance',
  'Operations',
  'Supply Chain',
  'Information Technology',
  'Customer Service',
  'Legal',
];

const DIVISIONS = [
  'Avionics',
  'Mission Systems',
  'Power & Controls',
  'Interiors',
  'Aerostructures',
  'Connected Aviation Solutions',
  'Corporate',
];

const LOCATIONS = [
  'Charlotte, NC',
  'Cedar Rapids, IA',
  'Windsor Locks, CT',
  'Rockford, IL',
  'Richardson, TX',
  'Phoenix, AZ',
  'Reading, UK',
  'Toulouse, FR',
];

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On leave' },
  { value: 'pre_start', label: 'Pre-start' },
  { value: 'terminated', label: 'Terminated' },
];

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Intern' },
];

const PAGE_SIZE = 15;

interface SortableColumn {
  field: EmployeeSortField;
  label: string;
}

const COLUMNS: SortableColumn[] = [
  { field: 'name', label: 'Name' },
  { field: 'jobTitle', label: 'Title' },
  { field: 'department', label: 'Department' },
  { field: 'location', label: 'Location' },
  { field: 'status', label: 'Status' },
];

export function DirectoryPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [division, setDivision] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [sort, setSort] = useState<EmployeeSortField>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const hasFilters = Boolean(
    search || department || division || location || status || employmentType,
  );

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: [
      'employees',
      { search, department, division, location, status, employmentType, sort, sortDir, page },
    ],
    queryFn: () =>
      api.get<Paginated<Employee>>('/employees', {
        search: search || undefined,
        department: department || undefined,
        division: division || undefined,
        location: location || undefined,
        status: status || undefined,
        employmentType: employmentType || undefined,
        sort,
        sortDir,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: (prev) => prev,
  });

  function toggleSort(field: EmployeeSortField) {
    setPage(1);
    if (sort === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setSortDir('asc');
    }
  }

  function resetFilters() {
    setSearch('');
    setDepartment('');
    setDivision('');
    setLocation('');
    setStatus('');
    setEmploymentType('');
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Employee Directory"
        description="Find and connect with people across Collins Aerospace."
        actions={
          can('employee:write') ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Add employee
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Search by name, title, email…"
              aria-label="Search employees"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <FilterSelect
            label="Department"
            value={department}
            onChange={setDepartment}
            onReset={() => setPage(1)}
            options={DEPARTMENTS.map((d) => ({ value: d, label: d }))}
            allLabel="All departments"
          />
          <FilterSelect
            label="Division"
            value={division}
            onChange={setDivision}
            onReset={() => setPage(1)}
            options={DIVISIONS.map((d) => ({ value: d, label: d }))}
            allLabel="All divisions"
          />
          <FilterSelect
            label="Location"
            value={location}
            onChange={setLocation}
            onReset={() => setPage(1)}
            options={LOCATIONS.map((l) => ({ value: l, label: l }))}
            allLabel="All locations"
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            onReset={() => setPage(1)}
            options={STATUSES}
            allLabel="All statuses"
          />
          <FilterSelect
            label="Employment type"
            value={employmentType}
            onChange={setEmploymentType}
            onReset={() => setPage(1)}
            options={EMPLOYMENT_TYPES}
            allLabel="All types"
          />
        </div>
        {hasFilters ? (
          <div className="mt-3 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<X className="h-3.5 w-3.5" />}
              onClick={resetFilters}
            >
              Clear filters
            </Button>
          </div>
        ) : null}
      </Card>

      <Card>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-8 w-8" />
          </div>
        ) : isError ? (
          <div className="p-6">
            <EmptyState
              icon={Users}
              title="Couldn't load the directory"
              description="Something went wrong fetching employees."
              action={
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : !data || data.data.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Users}
              title="No employees found"
              description={
                hasFilters ? 'Try adjusting or clearing your filters.' : 'No employees yet.'
              }
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  {COLUMNS.map((col) => (
                    <SortHeader
                      key={col.field}
                      column={col}
                      activeField={sort}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                  ))}
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

function FilterSelect({
  label,
  value,
  onChange,
  onReset,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        onReset();
      }}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

function SortHeader({
  column,
  activeField,
  direction,
  onSort,
}: {
  column: SortableColumn;
  activeField: EmployeeSortField;
  direction: SortDirection;
  onSort: (field: EmployeeSortField) => void;
}) {
  const active = activeField === column.field;
  const nextDir = active && direction === 'asc' ? 'descending' : 'ascending';
  return (
    <TH>
      <button
        type="button"
        onClick={() => onSort(column.field)}
        aria-label={`Sort by ${column.label} ${nextDir}`}
        className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700"
      >
        {column.label}
        {active ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 text-slate-300" />
        )}
      </button>
    </TH>
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
    division: 'Avionics',
    location: 'Cedar Rapids, IA',
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
        footer={<Button onClick={handleClose}>Done</Button>}
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
          <Field label="First name" htmlFor="create-first">
            <Input
              id="create-first"
              required
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </Field>
          <Field label="Last name" htmlFor="create-last">
            <Input
              id="create-last"
              required
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Work email" htmlFor="create-email">
          <Input
            id="create-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Job title" htmlFor="create-title">
          <Input
            id="create-title"
            required
            value={form.jobTitle}
            onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department" htmlFor="create-dept">
            <Select
              id="create-dept"
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
          <Field label="Division" htmlFor="create-division">
            <Select
              id="create-division"
              value={form.division}
              onChange={(e) => setForm({ ...form, division: e.target.value })}
            >
              {DIVISIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Location" htmlFor="create-location">
            <Select
              id="create-location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            >
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Employment type" htmlFor="create-type">
            <Select
              id="create-type"
              value={form.employmentType}
              onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Hire date" htmlFor="create-hire">
          <Input
            id="create-hire"
            type="date"
            required
            value={form.hireDate}
            onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
          />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}
