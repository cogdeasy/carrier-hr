import type {
  Address,
  ChangePasswordInput,
  EmergencyContact,
  Employee,
  UpdateEmployeeInput,
} from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { ApiError, api } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';

export function ProfilePage() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Employee>('/me'),
  });
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading || !me) return <LoadingPage />;

  return (
    <div>
      <PageHeader title="My Profile" description="Your personal and contact information." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody className="flex items-center gap-5">
            <Avatar name={me.displayName} src={me.avatarUrl} size="lg" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">{me.displayName}</h2>
              <p className="text-slate-600">{me.jobTitle}</p>
              <p className="text-sm text-slate-400">
                {me.department} · {me.location}
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Employment" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <Row label="Employee #" value={me.employeeNumber} />
              <Row label="Type" value={titleCase(me.employmentType)} />
              <Row label="Hire date" value={formatDate(me.hireDate)} />
              <Row label="Roles" value={me.roles.map((r) => titleCase(r)).join(', ')} />
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Contact & emergency"
            action={
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Pencil className="h-3.5 w-3.5" />}
                onClick={() => setEditOpen(true)}
              >
                Edit
              </Button>
            }
          />
          <CardBody>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail label="Work phone" value={me.workPhone ?? '—'} />
              <Detail label="Personal phone" value={me.personalPhone ?? '—'} />
              <Detail
                label="Home address"
                value={
                  me.address
                    ? `${me.address.line1}, ${me.address.city}, ${me.address.state} ${me.address.postalCode}`
                    : '—'
                }
              />
              <Detail
                label="Emergency contact"
                value={
                  me.emergencyContact
                    ? `${me.emergencyContact.name} (${me.emergencyContact.relationship}) · ${me.emergencyContact.phone}`
                    : '—'
                }
              />
            </dl>
          </CardBody>
        </Card>

        <ChangePasswordCard />
      </div>

      <EditContactModal
        key={me.updatedAt}
        me={me}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-700">{value}</dd>
    </div>
  );
}

function EditContactModal({
  me,
  open,
  onClose,
}: {
  me: Employee;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    workPhone: me.workPhone ?? '',
    personalPhone: me.personalPhone ?? '',
    line1: me.address?.line1 ?? '',
    city: me.address?.city ?? '',
    state: me.address?.state ?? '',
    postalCode: me.address?.postalCode ?? '',
    country: me.address?.country ?? '',
    ecName: me.emergencyContact?.name ?? '',
    ecRelationship: me.emergencyContact?.relationship ?? '',
    ecPhone: me.emergencyContact?.phone ?? '',
  }));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: UpdateEmployeeInput) => api.patch<Employee>('/me', input),
    onSuccess: (updated) => {
      qc.setQueryData(['me'], updated);
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Failed to save changes'),
  });

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const address: Address | null =
      form.line1 && form.city && form.state && form.postalCode && form.country
        ? {
            line1: form.line1,
            city: form.city,
            state: form.state,
            postalCode: form.postalCode,
            country: form.country,
          }
        : null;
    const emergencyContact: EmergencyContact | null =
      form.ecName && form.ecRelationship && form.ecPhone
        ? { name: form.ecName, relationship: form.ecRelationship, phone: form.ecPhone }
        : null;
    mutation.mutate({
      workPhone: form.workPhone || null,
      personalPhone: form.personalPhone || null,
      address,
      emergencyContact,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit contact details"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="edit-contact-form" type="submit" loading={mutation.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="edit-contact-form" onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Work phone" htmlFor="me-work-phone">
            <Input
              id="me-work-phone"
              value={form.workPhone}
              onChange={(e) => update('workPhone', e.target.value)}
            />
          </Field>
          <Field label="Personal phone" htmlFor="me-personal-phone">
            <Input
              id="me-personal-phone"
              value={form.personalPhone}
              onChange={(e) => update('personalPhone', e.target.value)}
            />
          </Field>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Home address</p>
        <Field label="Address line 1" htmlFor="me-line1">
          <Input id="me-line1" value={form.line1} onChange={(e) => update('line1', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" htmlFor="me-city">
            <Input id="me-city" value={form.city} onChange={(e) => update('city', e.target.value)} />
          </Field>
          <Field label="State" htmlFor="me-state">
            <Input
              id="me-state"
              value={form.state}
              onChange={(e) => update('state', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Postal code" htmlFor="me-postal">
            <Input
              id="me-postal"
              value={form.postalCode}
              onChange={(e) => update('postalCode', e.target.value)}
            />
          </Field>
          <Field label="Country" htmlFor="me-country">
            <Input
              id="me-country"
              value={form.country}
              onChange={(e) => update('country', e.target.value)}
            />
          </Field>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Emergency contact
        </p>
        <Field label="Name" htmlFor="me-ec-name">
          <Input
            id="me-ec-name"
            value={form.ecName}
            onChange={(e) => update('ecName', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Relationship" htmlFor="me-ec-rel">
            <Input
              id="me-ec-rel"
              value={form.ecRelationship}
              onChange={(e) => update('ecRelationship', e.target.value)}
            />
          </Field>
          <Field label="Phone" htmlFor="me-ec-phone">
            <Input
              id="me-ec-phone"
              value={form.ecPhone}
              onChange={(e) => update('ecPhone', e.target.value)}
            />
          </Field>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>
    </Modal>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (input: ChangePasswordInput) => api.post('/auth/change-password', input),
    onSuccess: () => {
      setMessage({ type: 'ok', text: 'Password updated successfully.' });
      setCurrent('');
      setNew('');
      setConfirm('');
    },
    onError: (err) =>
      setMessage({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'Failed to change password',
      }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    mutation.mutate({ currentPassword, newPassword, confirmPassword });
  }

  return (
    <Card>
      <CardHeader title="Change password" />
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Current password">
            <Input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="New password">
            <Input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password">
            <Input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {message ? (
            <p className={message.type === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-red-600'}>
              {message.text}
            </p>
          ) : null}
          <Button type="submit" loading={mutation.isPending}>
            Update password
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
