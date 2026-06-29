import type { ChangePasswordInput, Employee } from '@collins-hr/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { ApiError, api } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';

export function ProfilePage() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Employee>('/me'),
  });

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

      <div className="mt-6 max-w-md">
        <ChangePasswordCard />
      </div>
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
