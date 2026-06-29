import type { HrDashboard } from '@carrier-hr/shared';
import { useQuery } from '@tanstack/react-query';
import { Building2, TrendingDown, UserPlus, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { StatCard } from '../components/ui/StatCard';
import { api } from '../lib/api';

const PALETTE = ['#0033A0', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#0ea5e9'];

export function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'hr'],
    queryFn: () => api.get<HrDashboard>('/analytics/hr'),
  });

  if (isLoading || !data) return <LoadingPage />;

  return (
    <div>
      <PageHeader title="People Analytics" description="Organization-wide workforce insights." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total headcount" value={data.totalEmployees} icon={Users} />
        <StatCard
          label="New hires (mo.)"
          value={data.newHiresThisMonth}
          icon={UserPlus}
          hint={`${data.activeEmployees} active`}
        />
        <StatCard
          label="Attrition rate"
          value={`${data.attritionRate.toFixed(1)}%`}
          icon={TrendingDown}
        />
        <StatCard
          label="Open requisitions"
          value={data.openRequisitions}
          icon={Building2}
          hint={`Avg tenure ${data.avgTenureYears.toFixed(1)}y`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Headcount by department" />
          <CardBody>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.headcountByDepartment} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="department"
                  tick={{ fontSize: 12 }}
                  width={120}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#0033A0" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Headcount trend" subtitle="Hires vs. attrition" />
          <CardBody>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.headcountTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="headcount" stroke="#0033A0" strokeWidth={2} />
                <Line type="monotone" dataKey="hires" stroke="#22c55e" strokeWidth={2} />
                <Line type="monotone" dataKey="attrition" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Headcount by location" />
          <CardBody>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.headcountByLocation}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="location" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Gender distribution" />
          <CardBody>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.genderDistribution}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => entry.label}
                >
                  {data.genderDistribution.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
