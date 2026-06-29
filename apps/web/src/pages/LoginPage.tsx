import { FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';
import { ApiError } from '../lib/api';

interface LocationState {
  from?: { pathname?: string };
}

const DEMO_ACCOUNTS = [
  { label: 'HR Admin', email: 'hr.admin@carrier.com' },
  { label: 'Manager', email: 'manager@carrier.com' },
  { label: 'Employee', email: 'employee@carrier.com' },
  { label: 'Recruiter', email: 'recruiter@carrier.com' },
  { label: 'Executive', email: 'david.gitlin@carrier.com' },
];

export function LoginPage() {
  const { login, status } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') {
    const from = (location.state as LocationState)?.from?.pathname ?? '/';
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-carrier-700 p-12 text-white lg:flex">
        <Logo variant="light" className="h-12" />
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            The people platform for Carrier Global
          </h1>
          <p className="mt-4 max-w-md text-carrier-100">
            One home for your team, time off, pay, benefits, performance and growth — built for the
            53,000 people keeping the world comfortable and connected.
          </p>
        </div>
        <p className="text-sm text-carrier-200">© {new Date().getFullYear()} Carrier Global Corporation</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to your Carrier HR account.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field label="Work email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@carrier.com"
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            {error ? (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </div>
            ) : null}
            <Button type="submit" className="w-full" loading={submitting} size="lg">
              Sign in
            </Button>
          </form>

          <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Demo accounts
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => {
                    setEmail(acct.email);
                    setPassword('Password123!');
                  }}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-carrier-300 hover:text-carrier-700"
                >
                  {acct.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">Password for all demo accounts: Password123!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
