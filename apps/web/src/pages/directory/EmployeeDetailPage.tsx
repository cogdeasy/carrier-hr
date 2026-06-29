import type {
  Address,
  EmergencyContact,
  Employee,
  EmployeeRef,
  TerminateEmployeeInput,
  UpdateEmployeeInput,
} from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RotateCcw,
  ShieldAlert,
  UserX,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, statusTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Field, Input, Select } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { LoadingPage } from '../../components/ui/Spinner';
import { ApiError, api } from '../../lib/api';
import { formatDate, titleCase } from '../../lib/format';

const TABS = [
  { id: 'personal', label: 'Personal' },
  { id: 'employment', label: 'Employment' },
  { id: 'contact', label: 'Contact' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'roles', label: 'Roles' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [tab, setTab] = useState<TabId>('personal');
  const [editOpen, setEditOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);

  const canManage = can('employee:write');

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

  const terminated = employee.status === 'terminated';

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
          <div className="flex flex-col items-end gap-3">
            <div className="text-right text-sm text-slate-500">
              <p className="font-medium text-slate-700">#{employee.employeeNumber}</p>
              <p>Joined {formatDate(employee.hireDate)}</p>
              {employee.terminationDate ? (
                <p className="text-red-600">Left {formatDate(employee.terminationDate)}</p>
              ) : null}
            </div>
            {canManage ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => setEditOpen(true)}
                >
                  Edit
                </Button>
                {terminated ? (
                  <ReactivateButton employee={employee} />
                ) : (
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={<UserX className="h-3.5 w-3.5" />}
                    onClick={() => setTerminateOpen(true)}
                  >
                    Terminate
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-slate-100 px-2">
            <div role="tablist" aria-label="Profile sections" className="flex flex-wrap gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={
                    tab === t.id
                      ? 'border-b-2 border-collins-600 px-3 py-3 text-sm font-medium text-collins-700'
                      : 'border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-500 hover:text-slate-700'
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <CardBody>
            <div role="tabpanel">
              {tab === 'personal' ? <PersonalTab employee={employee} /> : null}
              {tab === 'employment' ? (
                <EmploymentTab employee={employee} manager={manager} />
              ) : null}
              {tab === 'contact' ? <ContactTab employee={employee} /> : null}
              {tab === 'emergency' ? <EmergencyTab employee={employee} /> : null}
              {tab === 'roles' ? <RolesTab employee={employee} /> : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Direct reports"
            subtitle={`${reports.length} team member${reports.length === 1 ? '' : 's'}`}
          />
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

      {canManage ? (
        <>
          <EditEmployeeModal
            key={employee.updatedAt}
            employee={employee}
            open={editOpen}
            onClose={() => setEditOpen(false)}
          />
          <TerminateModal
            employee={employee}
            open={terminateOpen}
            onClose={() => setTerminateOpen(false)}
          />
        </>
      ) : null}
    </div>
  );
}

function PersonalTab({ employee }: { employee: Employee }) {
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Detail label="Full name" value={employee.displayName} />
      <Detail label="Employee #" value={employee.employeeNumber} />
      <Detail label="Date of birth" value={formatDate(employee.dateOfBirth)} />
      <Detail icon={<Mail className="h-4 w-4" />} label="Work email" value={employee.email} />
    </dl>
  );
}

function EmploymentTab({ employee, manager }: { employee: Employee; manager?: Employee }) {
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Detail label="Job title" value={employee.jobTitle} />
      <Detail label="Department" value={employee.department} />
      <Detail label="Division" value={employee.division} />
      <Detail label="Employment type" value={titleCase(employee.employmentType)} />
      <Detail label="Status" value={titleCase(employee.status)} />
      <Detail label="Hire date" value={formatDate(employee.hireDate)} />
      <Detail label="Termination date" value={formatDate(employee.terminationDate)} />
      <Detail
        label="Manager"
        value={
          manager ? (
            <Link to={`/directory/${manager.id}`} className="text-collins-700 hover:underline">
              {manager.displayName}
            </Link>
          ) : (
            'None'
          )
        }
      />
    </dl>
  );
}

function ContactTab({ employee }: { employee: Employee }) {
  return (
    <div>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Detail icon={<Mail className="h-4 w-4" />} label="Email" value={employee.email} />
        <Detail
          icon={<Phone className="h-4 w-4" />}
          label="Work phone"
          value={employee.workPhone ?? '—'}
        />
        <Detail
          icon={<Phone className="h-4 w-4" />}
          label="Personal phone"
          value={employee.personalPhone ?? '—'}
        />
        <Detail icon={<MapPin className="h-4 w-4" />} label="Location" value={employee.location} />
      </dl>
      <div className="mt-6 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Home address</p>
        {employee.address ? (
          <p className="mt-1 text-sm text-slate-700">
            {employee.address.line1}
            {employee.address.line2 ? `, ${employee.address.line2}` : ''}, {employee.address.city},{' '}
            {employee.address.state} {employee.address.postalCode}, {employee.address.country}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-400">Not available.</p>
        )}
      </div>
    </div>
  );
}

function EmergencyTab({ employee }: { employee: Employee }) {
  if (!employee.emergencyContact) {
    return <p className="text-sm text-slate-400">No emergency contact on file.</p>;
  }
  const ec = employee.emergencyContact;
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Detail label="Name" value={ec.name} />
      <Detail label="Relationship" value={ec.relationship} />
      <Detail icon={<Phone className="h-4 w-4" />} label="Phone" value={ec.phone} />
    </dl>
  );
}

function RolesTab({ employee }: { employee: Employee }) {
  return (
    <div className="flex flex-wrap gap-2">
      {employee.roles.length === 0 ? (
        <p className="text-sm text-slate-400">No roles assigned.</p>
      ) : (
        employee.roles.map((r) => (
          <Badge key={r} tone="collins">
            {titleCase(r)}
          </Badge>
        ))
      )}
    </div>
  );
}

function ReactivateButton({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.post<Employee>(`/employees/${employee.id}/reactivate`),
    onSuccess: (updated) => {
      qc.setQueryData(['employee', employee.id], updated);
      void qc.invalidateQueries({ queryKey: ['employees'] });
    },
  });
  return (
    <Button
      variant="outline"
      size="sm"
      loading={mutation.isPending}
      leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
      onClick={() => mutation.mutate()}
    >
      Reactivate
    </Button>
  );
}

function TerminateModal({
  employee,
  open,
  onClose,
}: {
  employee: Employee;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'terminated' | 'on_leave'>('terminated');
  const [terminationDate, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: TerminateEmployeeInput) =>
      api.post<Employee>(`/employees/${employee.id}/terminate`, input),
    onSuccess: (updated) => {
      qc.setQueryData(['employee', employee.id], updated);
      void qc.invalidateQueries({ queryKey: ['employees'] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Failed to update employee'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`End ${employee.displayName}'s employment`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate({
                status,
                terminationDate,
                reason: reason || undefined,
              });
            }}
          >
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>This revokes directory visibility and marks the record inactive.</span>
        </div>
        <Field label="Action" htmlFor="terminate-status">
          <Select
            id="terminate-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'terminated' | 'on_leave')}
          >
            <option value="terminated">Terminate</option>
            <option value="on_leave">Place on leave</option>
          </Select>
        </Field>
        <Field label="Effective date" htmlFor="terminate-date">
          <Input
            id="terminate-date"
            type="date"
            required
            value={terminationDate}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Reason (optional)" htmlFor="terminate-reason">
          <Input
            id="terminate-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Resignation"
          />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}

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

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Intern' },
];

function EditEmployeeModal({
  employee,
  open,
  onClose,
}: {
  employee: Employee;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => toForm(employee));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: UpdateEmployeeInput) =>
      api.patch<Employee>(`/employees/${employee.id}`, input),
    onSuccess: (updated) => {
      qc.setQueryData(['employee', employee.id], updated);
      void qc.invalidateQueries({ queryKey: ['employees'] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Failed to save changes'),
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit() {
    setError(null);
    mutation.mutate(fromForm(form));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${employee.displayName}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="edit-employee-form" type="submit" loading={mutation.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form
        id="edit-employee-form"
        className="max-h-[60vh] space-y-4 overflow-y-auto pr-1"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="edit-first">
            <Input
              id="edit-first"
              required
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="edit-last">
            <Input
              id="edit-last"
              required
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Work email" htmlFor="edit-email">
          <Input
            id="edit-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>
        <Field label="Job title" htmlFor="edit-title">
          <Input
            id="edit-title"
            required
            value={form.jobTitle}
            onChange={(e) => set('jobTitle', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department" htmlFor="edit-dept">
            <Select
              id="edit-dept"
              value={form.department}
              onChange={(e) => set('department', e.target.value)}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Division" htmlFor="edit-division">
            <Select
              id="edit-division"
              value={form.division}
              onChange={(e) => set('division', e.target.value)}
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
          <Field label="Location" htmlFor="edit-location">
            <Input
              id="edit-location"
              required
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
            />
          </Field>
          <Field label="Employment type" htmlFor="edit-type">
            <Select
              id="edit-type"
              value={form.employmentType}
              onChange={(e) => set('employmentType', e.target.value)}
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Work phone" htmlFor="edit-work-phone">
            <Input
              id="edit-work-phone"
              value={form.workPhone}
              onChange={(e) => set('workPhone', e.target.value)}
            />
          </Field>
          <Field label="Personal phone" htmlFor="edit-personal-phone">
            <Input
              id="edit-personal-phone"
              value={form.personalPhone}
              onChange={(e) => set('personalPhone', e.target.value)}
            />
          </Field>
        </div>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Home address
        </p>
        <Field label="Address line 1" htmlFor="edit-line1">
          <Input
            id="edit-line1"
            value={form.line1}
            onChange={(e) => set('line1', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" htmlFor="edit-city">
            <Input id="edit-city" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="State" htmlFor="edit-state">
            <Input
              id="edit-state"
              value={form.state}
              onChange={(e) => set('state', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Postal code" htmlFor="edit-postal">
            <Input
              id="edit-postal"
              value={form.postalCode}
              onChange={(e) => set('postalCode', e.target.value)}
            />
          </Field>
          <Field label="Country" htmlFor="edit-country">
            <Input
              id="edit-country"
              value={form.country}
              onChange={(e) => set('country', e.target.value)}
            />
          </Field>
        </div>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Emergency contact
        </p>
        <Field label="Name" htmlFor="edit-ec-name">
          <Input
            id="edit-ec-name"
            value={form.ecName}
            onChange={(e) => set('ecName', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Relationship" htmlFor="edit-ec-rel">
            <Input
              id="edit-ec-rel"
              value={form.ecRelationship}
              onChange={(e) => set('ecRelationship', e.target.value)}
            />
          </Field>
          <Field label="Phone" htmlFor="edit-ec-phone">
            <Input
              id="edit-ec-phone"
              value={form.ecPhone}
              onChange={(e) => set('ecPhone', e.target.value)}
            />
          </Field>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: string;
  division: string;
  location: string;
  employmentType: string;
  workPhone: string;
  personalPhone: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  ecName: string;
  ecRelationship: string;
  ecPhone: string;
}

function toForm(e: Employee): FormState {
  return {
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    jobTitle: e.jobTitle,
    department: e.department,
    division: e.division,
    location: e.location,
    employmentType: e.employmentType,
    workPhone: e.workPhone ?? '',
    personalPhone: e.personalPhone ?? '',
    line1: e.address?.line1 ?? '',
    city: e.address?.city ?? '',
    state: e.address?.state ?? '',
    postalCode: e.address?.postalCode ?? '',
    country: e.address?.country ?? '',
    ecName: e.emergencyContact?.name ?? '',
    ecRelationship: e.emergencyContact?.relationship ?? '',
    ecPhone: e.emergencyContact?.phone ?? '',
  };
}

function fromForm(f: FormState): UpdateEmployeeInput {
  const address: Address | null =
    f.line1 && f.city && f.state && f.postalCode && f.country
      ? {
          line1: f.line1,
          city: f.city,
          state: f.state,
          postalCode: f.postalCode,
          country: f.country,
        }
      : null;
  const emergencyContact: EmergencyContact | null =
    f.ecName && f.ecRelationship && f.ecPhone
      ? { name: f.ecName, relationship: f.ecRelationship, phone: f.ecPhone }
      : null;
  return {
    firstName: f.firstName,
    lastName: f.lastName,
    email: f.email,
    jobTitle: f.jobTitle,
    department: f.department,
    division: f.division,
    location: f.location,
    employmentType: f.employmentType as UpdateEmployeeInput['employmentType'],
    workPhone: f.workPhone || null,
    personalPhone: f.personalPhone || null,
    address,
    emergencyContact,
  };
}

function Detail({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: React.ReactNode;
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
