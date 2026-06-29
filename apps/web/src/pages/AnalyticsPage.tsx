import type { AnalyticsDataset, CategoryCount, HrDashboard } from '@collins-hr/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CalendarClock,
  Download,
  GraduationCap,
  TrendingDown,
  UserPlus,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, Input, Select } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage, Spinner } from '../components/ui/Spinner';
import { StatCard } from '../components/ui/StatCard';
import { ApiError, api, getToken } from '../lib/api';
import { titleCase } from '../lib/format';

const PALETTE = ['#0033A0', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#0ea5e9'];

interface Filters {
  from: string;
  to: string;
  department: string;
  division: string;
  location: string;
  status: string;
}

const EMPTY_FILTERS: Filters = {
  from: '',
  to: '',
  department: '',
  division: '',
  location: '',
  status: '',
};

function toQuery(filters: Filters): Record<string, string> {
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
}

async function downloadCsv(dataset: AnalyticsDataset, filters: Filters): Promise<void> {
  const params = new URLSearchParams({ ...toQuery(filters), dataset });
  const res = await fetch(`/api/analytics/hr/export?${params.toString()}`, {
    headers: getToken() ? { Authorization: `Bearer ${getToken()!}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, 'export_failed', 'Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${dataset}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AnalyticsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['analytics', 'hr', filters],
    queryFn: () => api.get<HrDashboard>('/analytics/hr', toQuery(filters)),
    placeholderData: (prev) => prev,
  });

  // Baseline (unfiltered) load keeps the filter dropdowns stable even after a
  // categorical filter narrows the visible distributions.
  const { data: baseline } = useQuery({
    queryKey: ['analytics', 'hr', 'baseline'],
    queryFn: () => api.get<HrDashboard>('/analytics/hr'),
  });

  const options = useMemo(() => {
    const source = baseline ?? data;
    const labels = (rows?: CategoryCount[]) => (rows ?? []).map((r) => r.label).sort();
    return {
      departments: labels(source?.headcountByDepartment),
      divisions: labels(source?.headcountByDivision),
      locations: labels(source?.headcountByLocation),
    };
  }, [baseline, data]);

  if (isLoading && !data) return <LoadingPage />;

  if (isError || !data) {
    return (
      <div>
        <PageHeader title="People Analytics" description="Organization-wide workforce insights." />
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load analytics"
          description={error instanceof Error ? error.message : 'Please try again.'}
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  const pendingApprovals = data.pendingTimeOff + data.pendingTimesheets;

  return (
    <div>
      <PageHeader
        title="People Analytics"
        description="Organization-wide workforce insights and reporting."
        actions={isFetching ? <Spinner /> : undefined}
      />

      <FilterBar filters={filters} options={options} onChange={setFilters} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total headcount"
          value={data.totalEmployees}
          icon={Users}
          hint={`${data.activeEmployees} active · ${data.onLeave} on leave`}
        />
        <StatCard
          label="New hires (mo.)"
          value={data.newHiresThisMonth}
          icon={UserPlus}
          hint={`${data.hiresInRange} in range`}
        />
        <StatCard
          label="Turnover rate"
          value={`${data.turnoverRate.toFixed(1)}%`}
          icon={TrendingDown}
          hint={`${data.terminationsInRange} terminations in range`}
        />
        <StatCard
          label="Open requisitions"
          value={data.openRequisitions}
          icon={Building2}
          hint={`Avg tenure ${data.avgTenureYears.toFixed(1)}y`}
        />
        <StatCard
          label="Training compliance"
          value={`${data.trainingComplianceRate.toFixed(0)}%`}
          icon={GraduationCap}
        />
        <StatCard label="Pending approvals" value={pendingApprovals} icon={CalendarClock} hint={`${data.pendingTimeOff} time off · ${data.pendingTimesheets} timesheets`} />
        <StatCard label="On leave" value={data.onLeave} icon={Briefcase} />
        <StatCard label="Terminated" value={data.terminated} icon={TrendingDown} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Headcount trend"
          subtitle="Point-in-time headcount, hires and terminations"
          dataset="headcountTrend"
          filters={filters}
          isEmpty={data.headcountTrend.every((p) => p.headcount === 0)}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.headcountTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="headcount" stroke="#0033A0" strokeWidth={2} />
              <Line type="monotone" dataKey="hires" stroke="#22c55e" strokeWidth={2} />
              <Line type="monotone" dataKey="terminations" stroke="#ef4444" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Headcount by department"
          dataset="headcountByDepartment"
          filters={filters}
          isEmpty={data.headcountByDepartment.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.headcountByDepartment} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={130} />
              <Tooltip />
              <Bar dataKey="count" name="Headcount" fill="#0033A0" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Headcount by division"
          dataset="headcountByDivision"
          filters={filters}
          isEmpty={data.headcountByDivision.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.headcountByDivision} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={150} />
              <Tooltip />
              <Bar dataKey="count" name="Headcount" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Headcount by location"
          dataset="headcountByLocation"
          filters={filters}
          isEmpty={data.headcountByLocation.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.headcountByLocation}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Headcount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Tenure distribution"
          subtitle="Active employees by years of service"
          dataset="tenureDistribution"
          filters={filters}
          isEmpty={data.tenureDistribution.every((t) => t.count === 0)}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.tenureDistribution}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Employees" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Gender distribution"
          dataset="genderDistribution"
          filters={filters}
          isEmpty={data.genderDistribution.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={data.genderDistribution}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry: { label: string }) => entry.label}
              >
                {data.genderDistribution.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Time-off utilization"
          subtitle="Accrued vs. used days this year"
          dataset="timeOffUtilization"
          filters={filters}
          isEmpty={data.timeOffUtilization.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.timeOffUtilization.map((u) => ({ ...u, label: titleCase(u.type) }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="accruedDays" name="Accrued" fill="#93c5fd" radius={[4, 4, 0, 0]} />
              <Bar dataKey="usedDays" name="Used" fill="#0033A0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Open requisitions by department"
          dataset="openRequisitionsByDepartment"
          filters={filters}
          isEmpty={data.openRequisitionsByDepartment.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.openRequisitionsByDepartment} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={130} />
              <Tooltip />
              <Bar dataKey="count" name="Open requisitions" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function FilterBar({
  filters,
  options,
  onChange,
}: {
  filters: Filters;
  options: { departments: string[]; divisions: string[]; locations: string[] };
  onChange: (next: Filters) => void;
}) {
  const set = (key: keyof Filters, value: string) => onChange({ ...filters, [key]: value });
  const hasFilters = Object.values(filters).some((v) => v !== '');

  return (
    <Card className="mb-6">
      <CardBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Field label="From" htmlFor="filter-from">
            <Input
              id="filter-from"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => set('from', e.target.value)}
            />
          </Field>
          <Field label="To" htmlFor="filter-to">
            <Input
              id="filter-to"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => set('to', e.target.value)}
            />
          </Field>
          <Field label="Department" htmlFor="filter-department">
            <Select
              id="filter-department"
              value={filters.department}
              onChange={(e) => set('department', e.target.value)}
            >
              <option value="">All departments</option>
              {options.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Division" htmlFor="filter-division">
            <Select
              id="filter-division"
              value={filters.division}
              onChange={(e) => set('division', e.target.value)}
            >
              <option value="">All divisions</option>
              {options.divisions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Location" htmlFor="filter-location">
            <Select
              id="filter-location"
              value={filters.location}
              onChange={(e) => set('location', e.target.value)}
            >
              <option value="">All locations</option>
              {options.locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="filter-status">
            <Select
              id="filter-status"
              value={filters.status}
              onChange={(e) => set('status', e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="on_leave">On leave</option>
              <option value="terminated">Terminated</option>
              <option value="pre_start">Pre-start</option>
            </Select>
          </Field>
        </div>
        {hasFilters ? (
          <div className="mt-4">
            <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function ChartCard({
  title,
  subtitle,
  dataset,
  filters,
  isEmpty,
  children,
}: {
  title: string;
  subtitle?: string;
  dataset: AnalyticsDataset;
  filters: Filters;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    setExporting(true);
    try {
      await downloadCsv(dataset, filters);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Download className="h-4 w-4" />}
            loading={exporting}
            disabled={isEmpty}
            onClick={() => void onExport()}
            aria-label={`Export ${title} as CSV`}
          >
            CSV
          </Button>
        }
      />
      <CardBody>
        {isEmpty ? (
          <div className="py-10">
            <EmptyState title="No data" description="No records match the current filters." />
          </div>
        ) : (
          children
        )}
      </CardBody>
    </Card>
  );
}
