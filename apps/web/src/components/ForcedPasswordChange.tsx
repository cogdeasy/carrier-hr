import type { ChangePasswordInput } from '@collins-hr/shared';
import { useMutation } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, ApiError } from '../lib/api';
import { Logo } from './Logo';
import { Button } from './ui/Button';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Field, Input } from './ui/Field';

/**
 * Full-screen gate shown when the signed-in user still holds a temporary
 * password (`mustChangePassword`). The API blocks every other route until the
 * password is rotated, so we surface a dedicated screen rather than letting the
 * app render with pervasive 403s.
 */
export function ForcedPasswordChange() {
  const { refresh, logout } = useAuth();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: ChangePasswordInput) => api.post('/auth/change-password', input),
    onSuccess: async () => {
      await refresh();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Failed to change password'),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate({ currentPassword, newPassword, confirmPassword });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardHeader title="Set a new password" />
          <CardBody>
            <p className="mb-4 text-sm text-slate-600">
              Your account uses a temporary password. Choose a new password to continue.
            </p>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Current (temporary) password">
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
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button type="submit" className="w-full" loading={mutation.isPending}>
                Update password
              </Button>
              <button
                type="button"
                onClick={logout}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700"
              >
                Sign out
              </button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
