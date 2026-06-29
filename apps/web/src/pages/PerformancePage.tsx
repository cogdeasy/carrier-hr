import type { CreateGoalInput, Goal, Review } from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Target } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, Input, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';

export function PerformancePage() {
  const qc = useQueryClient();
  const [goalOpen, setGoalOpen] = useState(false);

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ['performance', 'goals'],
    queryFn: () => api.get<Goal[]>('/performance/goals'),
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ['performance', 'reviews'],
    queryFn: () => api.get<Review[]>('/performance/reviews'),
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, progress }: { id: string; progress: number }) =>
      api.patch(`/performance/goals/${id}`, {
        progress,
        status: progress >= 100 ? 'completed' : 'active',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['performance', 'goals'] });
    },
  });

  if (isLoading) return <LoadingPage />;

  return (
    <div>
      <PageHeader
        title="Performance"
        description="Track your goals and performance reviews."
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setGoalOpen(true)}>
            New goal
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Goals</h2>
          {goals.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState icon={Target} title="No goals yet" description="Set your first goal to get started." />
              </CardBody>
            </Card>
          ) : (
            goals.map((goal) => (
              <Card key={goal.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{goal.title}</p>
                      {goal.description ? (
                        <p className="mt-1 text-sm text-slate-500">{goal.description}</p>
                      ) : null}
                    </div>
                    <Badge tone={statusTone(goal.status)}>{titleCase(goal.status)}</Badge>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Progress</span>
                      <span>{goal.progress}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-collins-600"
                        style={{ width: `${goal.progress}%` }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        {goal.dueDate ? `Due ${formatDate(goal.dueDate)}` : 'No due date'}
                      </span>
                      <div className="flex gap-1">
                        {[25, 50, 75, 100].map((p) => (
                          <button
                            key={p}
                            onClick={() => updateGoal.mutate({ id: goal.id, progress: p })}
                            className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-collins-300 hover:text-collins-700"
                          >
                            {p}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>

        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            My reviews
          </h2>
          <Card>
            <CardBody className="p-0">
              {reviews.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">No reviews assigned.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {reviews.map((r) => (
                    <li key={r.id} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-900">
                          {r.cycle?.name ?? 'Review'}
                        </p>
                        <Badge tone={statusTone(r.status)}>{titleCase(r.status)}</Badge>
                      </div>
                      {r.overallRating ? (
                        <p className="mt-1 text-xs text-slate-500">Rating: {r.overallRating}/5</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <GoalModal open={goalOpen} onClose={() => setGoalOpen(false)} />
    </div>
  );
}

function GoalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const mutation = useMutation({
    mutationFn: (input: CreateGoalInput) => api.post('/performance/goals', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['performance', 'goals'] });
      setTitle('');
      setDescription('');
      setDueDate('');
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({
      title,
      description: description || undefined,
      dueDate: dueDate || undefined,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New goal"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button form="goal-form" type="submit" loading={mutation.isPending}>
            Create goal
          </Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Title">
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description (optional)">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Due date (optional)">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
