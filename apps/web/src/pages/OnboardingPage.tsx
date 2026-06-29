import type { OnboardingPlan } from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle } from 'lucide-react';
import { Badge, statusTone } from '../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';

export function OnboardingPage() {
  const qc = useQueryClient();
  const { data: plan, isLoading } = useQuery({
    queryKey: ['onboarding', 'plan'],
    queryFn: () => api.get<OnboardingPlan>('/onboarding/plan'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'completed' | 'pending' }) =>
      api.patch(`/onboarding/tasks/${id}`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['onboarding', 'plan'] });
    },
  });

  if (isLoading) return <LoadingPage />;

  if (!plan || plan.totalTasks === 0) {
    return (
      <div>
        <PageHeader title="Onboarding" />
        <Card>
          <CardBody>
            <EmptyState
              icon={CheckCircle2}
              title="No onboarding tasks"
              description="You're all set — there are no onboarding items assigned to you."
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  const grouped = plan.tasks.reduce<Record<string, typeof plan.tasks>>((acc, task) => {
    (acc[task.category] ??= []).push(task);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title="Onboarding" description="Complete your tasks to get up to speed." />

      <Card className="mb-6">
        <CardBody>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">
              {plan.completedTasks} of {plan.totalTasks} tasks complete
            </span>
            <span className="font-semibold text-collins-700">{plan.percentComplete}%</span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-collins-600 transition-all"
              style={{ width: `${plan.percentComplete}%` }}
            />
          </div>
        </CardBody>
      </Card>

      <div className="space-y-6">
        {Object.entries(grouped).map(([category, tasks]) => (
          <Card key={category}>
            <CardHeader title={category} />
            <CardBody className="p-0">
              <ul className="divide-y divide-slate-100">
                {tasks.map((task) => {
                  const done = task.status === 'completed';
                  return (
                    <li key={task.id} className="flex items-start gap-3 px-5 py-3">
                      <button
                        onClick={() =>
                          toggle.mutate({ id: task.id, status: done ? 'pending' : 'completed' })
                        }
                        className="mt-0.5 text-collins-600"
                        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {done ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <Circle className="h-5 w-5 text-slate-300" />
                        )}
                      </button>
                      <div className="flex-1">
                        <p
                          className={
                            done ? 'text-sm text-slate-400 line-through' : 'text-sm font-medium text-slate-900'
                          }
                        >
                          {task.title}
                        </p>
                        {task.description ? (
                          <p className="text-xs text-slate-500">{task.description}</p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-slate-400">
                          Owner: {titleCase(task.assigneeRole)}
                          {task.dueDate ? ` · Due ${formatDate(task.dueDate)}` : ''}
                        </p>
                      </div>
                      <Badge tone={statusTone(task.status)}>{titleCase(task.status)}</Badge>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
