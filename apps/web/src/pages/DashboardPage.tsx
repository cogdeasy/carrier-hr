import type { EmployeeDashboard, HrDashboard, TeamDashboard } from '@collins-hr/shared';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Target,
  TrendingDown,
  UserPlus,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { StatCard } from '../components/ui/StatCard';
import { api } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';

export function DashboardPage() {
  const { user, can } = useAuth();
  const canSeeTeam = can('analytics:read:team');
  const canSeeOrg = can('analytics:read');

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

      {canSeeTeam ? <TeamSection /> : null}
      {canSeeOrg ? <OrgSection /> : null}

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
                  <li
                    key={`${h.name}-${h.date}`}
                    className="flex items-center justify-between px-5 py-3"
                  >
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
                <Link
                  to="/onboarding"
                  className="mt-2 inline-block text-xs font-medium text-collins-700 hover:underline"
                >
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

function TeamSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'team'],
    queryFn: () => api.get<TeamDashboard>('/analytics/team'),
  });

  if (isLoading || !data) return null;
  if (data.teamSize === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Your team
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Team size"
          value={data.teamSize}
          icon={Users}
          hint={`${data.activeMembers} active · ${data.onLeave} on leave`}
        />
        <StatCard
          label="Pending approvals"
          value={data.pendingTimeOff + data.pendingTimesheets}
          icon={ClipboardCheck}
          hint={`${data.pendingTimeOff} time off · ${data.pendingTimesheets} timesheets`}
        />
        <StatCard
          label="Goals"
          value={data.activeGoals}
          icon={Target}
          hint={`${data.atRiskGoals} at risk`}
        />
        <StatCard
          label="Training compliance"
          value={`${data.trainingComplianceRate.toFixed(0)}%`}
          icon={GraduationCap}
          hint={`${data.pendingReviews} pending reviews`}
        />
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader title="Upcoming team time off" subtitle="Approved and upcoming" />
          <CardBody className="p-0">
            {data.upcomingTimeOff.length === 0 ? (
              <div className="px-5 py-6">
                <EmptyState title="No upcoming time off" />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.upcomingTimeOff.map((u, i) => (
                  <li
                    key={`${u.employeeName}-${u.startDate}-${i}`}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">{u.employeeName}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(u.startDate)} – {formatDate(u.endDate)} · {u.totalDays}d
                      </p>
                    </div>
                    <Badge tone={statusTone(u.type)}>{titleCase(u.type)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </section>
  );
}

function OrgSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'hr', 'dashboard-summary'],
    queryFn: () => api.get<HrDashboard>('/analytics/hr'),
  });

  if (isLoading || !data) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Organization
        </h2>
        <Link to="/analytics">
          <Button variant="outline" size="sm">
            View full analytics
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total headcount"
          value={data.totalEmployees}
          icon={Users}
          hint={`${data.activeEmployees} active`}
        />
        <StatCard label="New hires (mo.)" value={data.newHiresThisMonth} icon={UserPlus} />
        <StatCard
          label="Turnover rate"
          value={`${data.turnoverRate.toFixed(1)}%`}
          icon={TrendingDown}
        />
        <StatCard
          label="Open requisitions"
          value={data.openRequisitions}
          icon={ClipboardCheck}
        />
      </div>
    </section>
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
