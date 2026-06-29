import type { EmployeeDashboard } from '@collins-hr/shared';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, GraduationCap, Bell, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { LoadingPage } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['me', 'dashboard'],
    queryFn: () => api.get<EmployeeDashboard>('/me/dashboard'),
  });

  if (isLoading || !data) return <LoadingPage />;

  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's what's happening across your work today."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Time off balance"
          value={`${data.timeOffBalanceDays} days`}
          icon={CalendarDays}
          hint={`${data.pendingRequests} pending request${data.pendingRequests === 1 ? '' : 's'}`}
        />
        <StatCard label="Active goals" value={data.activeGoals} icon={Target} />
        <StatCard
          label="Required courses"
          value={data.requiredCoursesOutstanding}
          icon={GraduationCap}
          hint="Outstanding"
        />
        <StatCard
          label="Notifications"
          value={data.unreadNotifications}
          icon={Bell}
          hint="Unread"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming holidays" subtitle="Company-observed days off" />
          <CardBody className="p-0">
            {data.upcomingHolidays.length === 0 ? (
              <div className="px-5 py-6">
                <EmptyState title="No upcoming holidays" />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.upcomingHolidays.map((h) => (
                  <li key={`${h.name}-${h.date}`} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm font-medium text-slate-700">{h.name}</span>
                    <span className="text-sm text-slate-500">{formatDate(h.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Quick actions" />
          <CardBody>
            <div className="grid grid-cols-2 gap-3">
              <QuickLink to="/time-off" label="Request time off" />
              <QuickLink to="/timesheets" label="Log timesheet" />
              <QuickLink to="/performance" label="View goals" />
              <QuickLink to="/directory" label="Browse directory" />
              <QuickLink to="/payroll" label="View payslips" />
              <QuickLink to="/benefits" label="Manage benefits" />
            </div>
            {data.onboardingPercent !== null ? (
              <div className="mt-4 rounded-lg bg-collins-50 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-collins-800">Onboarding progress</span>
                  <span className="font-semibold text-collins-800">{data.onboardingPercent}%</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-collins-100">
                  <div
                    className="h-full rounded-full bg-collins-600"
                    style={{ width: `${data.onboardingPercent}%` }}
                  />
                </div>
                <Link to="/onboarding" className="mt-2 inline-block text-xs font-medium text-collins-700 hover:underline">
                  Continue onboarding →
                </Link>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-collins-300 hover:bg-collins-50 hover:text-collins-700"
    >
      {label}
    </Link>
  );
}
