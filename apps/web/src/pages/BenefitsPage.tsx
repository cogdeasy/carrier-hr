import type { BenefitEnrollment, BenefitPlan, EnrollBenefitInput } from '@carrier-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartPulse } from 'lucide-react';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { formatCents, titleCase } from '../lib/format';

export function BenefitsPage() {
  const qc = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['benefits', 'plans'],
    queryFn: () => api.get<BenefitPlan[]>('/benefits/plans'),
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['benefits', 'enrollments'],
    queryFn: () => api.get<BenefitEnrollment[]>('/benefits/enrollments'),
  });

  const enroll = useMutation({
    mutationFn: (input: EnrollBenefitInput) => api.post('/benefits/enrollments', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['benefits'] });
    },
  });

  if (isLoading) return <LoadingPage />;

  const enrolledPlanIds = new Map(enrollments.map((e) => [e.planId, e]));

  return (
    <div>
      <PageHeader title="Benefits" description="Review and enroll in your benefit plans." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const enrollment = enrolledPlanIds.get(plan.id);
          return (
            <Card key={plan.id}>
              <CardHeader
                title={plan.name}
                subtitle={`${plan.carrier} · ${titleCase(plan.type)}`}
                action={
                  enrollment ? (
                    <Badge tone={statusTone(enrollment.status)}>{titleCase(enrollment.status)}</Badge>
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-carrier-50 text-carrier-700">
                      <HeartPulse className="h-4 w-4" />
                    </span>
                  )
                }
              />
              <CardBody>
                <p className="text-sm text-slate-600">{plan.description}</p>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Coverage</dt>
                    <dd className="font-medium text-slate-700">{plan.coverageLevel}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Monthly premium</dt>
                    <dd className="font-medium text-slate-700">{formatCents(plan.monthlyPremiumCents)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Employer pays</dt>
                    <dd className="font-medium text-emerald-600">
                      {formatCents(plan.employerContributionCents)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    variant={enrollment?.status === 'enrolled' ? 'outline' : 'primary'}
                    loading={enroll.isPending}
                    onClick={() => enroll.mutate({ planId: plan.id, status: 'enrolled', dependents: 0 })}
                  >
                    {enrollment?.status === 'enrolled' ? 'Enrolled' : 'Enroll'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={enroll.isPending}
                    onClick={() => enroll.mutate({ planId: plan.id, status: 'waived', dependents: 0 })}
                  >
                    Waive
                  </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
