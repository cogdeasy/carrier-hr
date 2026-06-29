import {
  ASSIGNEE_ROLE_LABELS,
  ONBOARDING_ASSIGNEE_ROLES,
  type Employee,
  type OnboardingAssigneeRole,
  type OnboardingChecklist,
  type OnboardingTask,
  type OnboardingTemplate,
  type Paginated,
} from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ClipboardList,
  LogOut,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, Input, Select } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage, Spinner } from '../components/ui/Spinner';
import { ApiError, api } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';

type Tab = 'mine' | 'manage' | 'templates';

export function OnboardingPage() {
  const { user, can } = useAuth();
  const isManager = user?.roles.includes('manager') ?? false;
  const canAdmin = can('onboarding:admin');
  const canManage = canAdmin || isManager || can('onboarding:read');
  const [tab, setTab] = useState<Tab>('mine');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'mine', label: 'My checklists' },
    ...(canManage ? [{ id: 'manage' as const, label: 'Manage' }] : []),
    ...(canAdmin ? [{ id: 'templates' as const, label: 'Templates' }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Onboarding & Offboarding"
        description="Track ramp-up and exit checklists from a single place."
      />

      {tabs.length > 1 ? (
        <div className="mb-6 flex gap-1 border-b border-slate-200" role="tablist" aria-label="Onboarding views">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'border-b-2 border-collins-600 px-4 py-2 text-sm font-semibold text-collins-700'
                  : 'border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700'
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === 'mine' ? <MyChecklists /> : null}
      {tab === 'manage' ? <ManageChecklists canAdmin={canAdmin} /> : null}
      {tab === 'templates' ? <TemplatesView /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared task helpers
// ---------------------------------------------------------------------------

function ProgressBar({ checklist }: { checklist: OnboardingChecklist }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">
          {checklist.completedTasks} of {checklist.totalTasks} tasks complete
        </span>
        <span className="flex items-center gap-2">
          {checklist.overdueTasks > 0 ? (
            <Badge tone="danger">{checklist.overdueTasks} overdue</Badge>
          ) : null}
          <span className="font-semibold text-collins-700">{checklist.percentComplete}%</span>
        </span>
      </div>
      <div
        className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={checklist.percentComplete}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${checklist.title} progress`}
      >
        <div
          className="h-full rounded-full bg-collins-600 transition-all"
          style={{ width: `${checklist.percentComplete}%` }}
        />
      </div>
    </div>
  );
}

function groupByAssignee(tasks: OnboardingTask[]): [string, OnboardingTask[]][] {
  const order = ONBOARDING_ASSIGNEE_ROLES as readonly string[];
  const grouped = tasks.reduce<Record<string, OnboardingTask[]>>((acc, task) => {
    (acc[task.assigneeRole] ??= []).push(task);
    return acc;
  }, {});
  return Object.entries(grouped).sort(
    ([a], [b]) => order.indexOf(a) - order.indexOf(b),
  );
}

function assigneeLabel(role: string): string {
  return ASSIGNEE_ROLE_LABELS[role as OnboardingAssigneeRole] ?? titleCase(role);
}

function TaskRow({
  task,
  onToggle,
  onDelete,
  pending,
}: {
  task: OnboardingTask;
  onToggle?: (task: OnboardingTask) => void;
  onDelete?: (task: OnboardingTask) => void;
  pending?: boolean;
}) {
  const done = task.status === 'completed';
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <button
        onClick={() => onToggle?.(task)}
        disabled={!onToggle || pending}
        className="mt-0.5 text-collins-600 disabled:opacity-50"
        aria-label={done ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
        aria-pressed={done}
      >
        {done ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <Circle className="h-5 w-5 text-slate-300" />
        )}
      </button>
      <div className="flex-1">
        <p className={done ? 'text-sm text-slate-400 line-through' : 'text-sm font-medium text-slate-900'}>
          {task.title}
        </p>
        {task.description ? <p className="text-xs text-slate-500">{task.description}</p> : null}
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{task.category}</span>
          {task.dueDate ? <span>Due {formatDate(task.dueDate)}</span> : null}
          {task.overdue ? (
            <span className="inline-flex items-center gap-1 font-medium text-red-600">
              <AlertTriangle className="h-3 w-3" /> Overdue
            </span>
          ) : null}
        </p>
      </div>
      <Badge tone={task.overdue ? 'danger' : statusTone(task.status)}>
        {task.overdue ? 'Overdue' : titleCase(task.status)}
      </Badge>
      {onDelete ? (
        <button
          onClick={() => onDelete(task)}
          className="mt-0.5 text-slate-300 hover:text-red-600"
          aria-label={`Delete "${task.title}"`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </li>
  );
}

function ChecklistBody({
  checklist,
  onToggle,
  onDelete,
  pendingTaskId,
}: {
  checklist: OnboardingChecklist;
  onToggle?: (task: OnboardingTask) => void;
  onDelete?: (task: OnboardingTask) => void;
  pendingTaskId?: string | null;
}) {
  const groups = groupByAssignee(checklist.tasks ?? []);
  return (
    <div className="space-y-4">
      <ProgressBar checklist={checklist} />
      {groups.map(([role, tasks]) => (
        <div key={role}>
          <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {assigneeLabel(role)}
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={onToggle}
                onDelete={onDelete}
                pending={pendingTaskId === task.id}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function useToggleTask(invalidateKey: unknown[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ task }: { task: OnboardingTask }) =>
      api.patch(`/onboarding/tasks/${task.id}`, {
        status: task.status === 'completed' ? 'pending' : 'completed',
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: invalidateKey });
    },
  });
}

// ---------------------------------------------------------------------------
// Tab: My checklists
// ---------------------------------------------------------------------------

function MyChecklists() {
  const { data: checklists, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['onboarding', 'me'],
    queryFn: () => api.get<OnboardingChecklist[]>('/onboarding/me'),
  });
  const toggle = useToggleTask(['onboarding', 'me']);

  if (isLoading) return <LoadingPage />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  if (!checklists || checklists.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={CheckCircle2}
            title="No checklists assigned"
            description="You're all set — there are no onboarding or offboarding tasks assigned to you."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {checklists.map((checklist) => (
        <Card key={checklist.id}>
          <CardHeader
            title={checklist.title}
            subtitle={`Starts ${formatDate(checklist.anchorDate)}`}
            action={
              <div className="flex items-center gap-2">
                <Badge tone={checklist.type === 'offboarding' ? 'warning' : 'collins'}>
                  {titleCase(checklist.type)}
                </Badge>
                <Badge tone={statusTone(checklist.status)}>{titleCase(checklist.status)}</Badge>
              </div>
            }
          />
          <CardBody>
            <ChecklistBody
              checklist={checklist}
              onToggle={(task) => toggle.mutate({ task })}
              pendingTaskId={toggle.isPending ? toggle.variables?.task.id : null}
            />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Manage
// ---------------------------------------------------------------------------

function ManageChecklists({ canAdmin }: { canAdmin: boolean }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'onboard' | 'offboard'>(null);

  const { data: checklists, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['onboarding', 'checklists', filter],
    queryFn: () =>
      api.get<OnboardingChecklist[]>('/onboarding/checklists', filter ? { type: filter } : undefined),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['onboarding', 'checklists'] });
    if (selectedId) void qc.invalidateQueries({ queryKey: ['onboarding', 'checklist', selectedId] });
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select
          className="h-9 w-44"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All checklists</option>
          <option value="onboarding">Onboarding</option>
          <option value="offboarding">Offboarding</option>
        </Select>
        {canAdmin ? (
          <div className="flex gap-2">
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setModal('onboard')}>
              New onboarding
            </Button>
            <Button
              variant="outline"
              leftIcon={<LogOut className="h-4 w-4" />}
              onClick={() => setModal('offboard')}
            >
              Offboard employee
            </Button>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <LoadingPage />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !checklists || checklists.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={ClipboardList}
              title="No checklists yet"
              description={
                canAdmin
                  ? 'Instantiate a checklist from a template to get started.'
                  : 'There are no checklists for your team yet.'
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {checklists.map((checklist) => (
            <Card key={checklist.id}>
              <button
                className="w-full px-5 py-4 text-left"
                onClick={() => setSelectedId(selectedId === checklist.id ? null : checklist.id)}
                aria-expanded={selectedId === checklist.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {checklist.employee?.name ?? 'Employee'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {checklist.title}
                      {checklist.employee?.jobTitle ? ` · ${checklist.employee.jobTitle}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={checklist.type === 'offboarding' ? 'warning' : 'collins'}>
                      {titleCase(checklist.type)}
                    </Badge>
                    {checklist.overdueTasks > 0 ? (
                      <Badge tone="danger">{checklist.overdueTasks} overdue</Badge>
                    ) : null}
                    <Badge tone={statusTone(checklist.status)}>{titleCase(checklist.status)}</Badge>
                    <span className="text-sm font-semibold text-collins-700">
                      {checklist.percentComplete}%
                    </span>
                  </div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-collins-600"
                    style={{ width: `${checklist.percentComplete}%` }}
                  />
                </div>
              </button>
              {selectedId === checklist.id ? (
                <div className="border-t border-slate-100 px-5 py-4">
                  <ChecklistDetail
                    checklistId={checklist.id}
                    canAdmin={canAdmin}
                    onChanged={refresh}
                  />
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {modal === 'onboard' ? (
        <InstantiateModal
          mode="onboard"
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            refresh();
          }}
        />
      ) : null}
      {modal === 'offboard' ? (
        <InstantiateModal
          mode="offboard"
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ChecklistDetail({
  checklistId,
  canAdmin,
  onChanged,
}: {
  checklistId: string;
  canAdmin: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const key = ['onboarding', 'checklist', checklistId];
  const { data: checklist, isLoading, isError, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => api.get<OnboardingChecklist>(`/onboarding/checklists/${checklistId}`),
  });

  const toggle = useMutation({
    mutationFn: ({ task }: { task: OnboardingTask }) =>
      api.patch(`/onboarding/tasks/${task.id}`, {
        status: task.status === 'completed' ? 'pending' : 'completed',
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      onChanged();
    },
  });

  const removeTask = useMutation({
    mutationFn: ({ task }: { task: OnboardingTask }) => api.delete(`/onboarding/tasks/${task.id}`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      onChanged();
    },
  });

  const cancel = useMutation({
    mutationFn: () => api.patch(`/onboarding/checklists/${checklistId}`, { status: 'cancelled' }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      onChanged();
    },
  });

  if (isLoading) return <Spinner />;
  if (isError || !checklist) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <ChecklistBody
        checklist={checklist}
        onToggle={(task) => toggle.mutate({ task })}
        onDelete={canAdmin ? (task) => removeTask.mutate({ task }) : undefined}
        pendingTaskId={toggle.isPending ? toggle.variables?.task.id : null}
      />
      {canAdmin ? (
        <div className="mt-4 flex justify-end gap-2">
          <AddTaskButton checklistId={checklistId} onAdded={onChanged} />
          {checklist.status !== 'cancelled' ? (
            <Button variant="danger" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel checklist
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AddTaskButton({ checklistId, onAdded }: { checklistId: string; onAdded: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [assigneeRole, setAssigneeRole] = useState<OnboardingAssigneeRole>('employee');
  const [dueDate, setDueDate] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post(`/onboarding/checklists/${checklistId}/tasks`, {
        title,
        category,
        assigneeRole,
        dueDate: dueDate || null,
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setDueDate('');
      void qc.invalidateQueries({ queryKey: ['onboarding', 'checklist', checklistId] });
      onAdded();
    },
  });

  return (
    <>
      <Button variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
        Add task
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add task"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={create.isPending} disabled={!title.trim()} onClick={() => create.mutate()}>
              Add task
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Title" htmlFor="task-title">
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Category" htmlFor="task-category">
            <Input id="task-category" value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label="Assignee" htmlFor="task-assignee">
            <Select
              id="task-assignee"
              value={assigneeRole}
              onChange={(e) => setAssigneeRole(e.target.value as OnboardingAssigneeRole)}
            >
              {ONBOARDING_ASSIGNEE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ASSIGNEE_ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" htmlFor="task-due">
            <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          {create.isError ? <FormError error={create.error} /> : null}
        </div>
      </Modal>
    </>
  );
}

function InstantiateModal({
  mode,
  onClose,
  onDone,
}: {
  mode: 'onboard' | 'offboard';
  onClose: () => void;
  onDone: () => void;
}) {
  const offboard = mode === 'offboard';
  const [employeeId, setEmployeeId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [date, setDate] = useState('');
  const [empSearch, setEmpSearch] = useState('');

  const { data: employees } = useQuery({
    queryKey: ['employees', 'picker', empSearch],
    queryFn: () =>
      api.get<Paginated<Employee>>('/employees', {
        pageSize: 100,
        search: empSearch || undefined,
      }),
  });
  const employeeOptions = employees?.data ?? [];
  const employeeOverflow = (employees?.total ?? 0) > employeeOptions.length;
  const { data: templates } = useQuery({
    queryKey: ['onboarding', 'templates', mode],
    queryFn: () =>
      api.get<OnboardingTemplate[]>('/onboarding/templates', {
        type: offboard ? 'offboarding' : 'onboarding',
      }),
  });

  const submit = useMutation({
    mutationFn: () =>
      offboard
        ? api.post('/onboarding/offboarding', {
            employeeId,
            lastDay: date,
            templateId: templateId || undefined,
          })
        : api.post('/onboarding/checklists', { employeeId, templateId, anchorDate: date }),
    onSuccess: onDone,
  });

  const valid = employeeId && date && (offboard || templateId);

  return (
    <Modal
      open
      onClose={onClose}
      title={offboard ? 'Offboard employee' : 'New onboarding checklist'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={submit.isPending} disabled={!valid} onClick={() => submit.mutate()}>
            {offboard ? 'Trigger offboarding' : 'Create checklist'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Employee" htmlFor="inst-emp">
          <div className="space-y-2">
            <Input
              id="inst-emp-search"
              type="search"
              placeholder="Search by name, title, email…"
              value={empSearch}
              onChange={(e) => {
                setEmpSearch(e.target.value);
                setEmployeeId('');
              }}
              aria-label="Search employees"
            />
            <Select id="inst-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select an employee…</option>
              {employeeOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.displayName} · {e.jobTitle}
                </option>
              ))}
            </Select>
            {employeeOverflow ? (
              <p className="text-xs text-slate-500">
                Showing the first {employeeOptions.length} of {employees?.total} employees — refine your search to
                narrow the list.
              </p>
            ) : null}
          </div>
        </Field>
        <Field label={offboard ? 'Template (optional — defaults to standard)' : 'Template'} htmlFor="inst-tpl">
          <Select id="inst-tpl" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">{offboard ? 'Default offboarding template' : 'Select a template…'}</option>
            {templates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.itemCount} tasks)
              </option>
            ))}
          </Select>
        </Field>
        <Field label={offboard ? 'Last working day' : 'Start date'} htmlFor="inst-date">
          <Input id="inst-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {offboard ? (
          <p className="text-xs text-slate-500">
            This marks the employee as terminated and creates asset-return and access-revocation tasks.
          </p>
        ) : null}
        {submit.isError ? <FormError error={submit.error} /> : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Tab: Templates
// ---------------------------------------------------------------------------

function TemplatesView() {
  const { data: templates, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['onboarding', 'templates', 'all'],
    queryFn: () => api.get<OnboardingTemplate[]>('/onboarding/templates'),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <LoadingPage />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader title="Templates" />
        <CardBody className="p-0">
          {!templates || templates.length === 0 ? (
            <div className="p-5">
              <EmptyState icon={ClipboardList} title="No templates" />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className={
                      selectedId === t.id
                        ? 'w-full bg-collins-50 px-5 py-3 text-left'
                        : 'w-full px-5 py-3 text-left hover:bg-slate-50'
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900">{t.name}</span>
                      {t.isDefault ? <Badge tone="collins">Default</Badge> : null}
                    </div>
                    <p className="text-xs text-slate-500">
                      {titleCase(t.type)} · {t.itemCount} tasks
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="lg:col-span-2">
        {selectedId ? (
          <TemplateEditor templateId={selectedId} />
        ) : (
          <Card>
            <CardBody>
              <EmptyState
                icon={ClipboardList}
                title="Select a template"
                description="Choose a template to view and edit its tasks."
              />
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function TemplateEditor({ templateId }: { templateId: string }) {
  const qc = useQueryClient();
  const key = ['onboarding', 'template', templateId];
  const { data: template, isLoading, isError, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => api.get<OnboardingTemplate>(`/onboarding/templates/${templateId}`),
  });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('general');
  const [assigneeRole, setAssigneeRole] = useState<OnboardingAssigneeRole>('employee');
  const [dueOffsetDays, setDueOffsetDays] = useState('0');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['onboarding', 'templates'] });
  };

  const addItem = useMutation({
    mutationFn: () =>
      api.post(`/onboarding/templates/${templateId}/items`, {
        title,
        category,
        assigneeRole,
        dueOffsetDays: Number(dueOffsetDays) || 0,
      }),
    onSuccess: () => {
      setAdding(false);
      setTitle('');
      setDueOffsetDays('0');
      invalidate();
    },
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.delete(`/onboarding/templates/${templateId}/items/${itemId}`),
    onSuccess: invalidate,
  });

  if (isLoading) return <LoadingPage />;
  if (isError || !template) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <Card>
      <CardHeader
        title={template.name}
        subtitle={template.description ?? `${titleCase(template.type)} template`}
        action={
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding((v) => !v)}>
            Add task
          </Button>
        }
      />
      <CardBody className="p-0">
        {adding ? (
          <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="ti-title">
              <Input id="ti-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Category" htmlFor="ti-cat">
              <Input id="ti-cat" value={category} onChange={(e) => setCategory(e.target.value)} />
            </Field>
            <Field label="Assignee" htmlFor="ti-role">
              <Select
                id="ti-role"
                value={assigneeRole}
                onChange={(e) => setAssigneeRole(e.target.value as OnboardingAssigneeRole)}
              >
                {ONBOARDING_ASSIGNEE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ASSIGNEE_ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due offset (days from start/end)" htmlFor="ti-off">
              <Input
                id="ti-off"
                type="number"
                value={dueOffsetDays}
                onChange={(e) => setDueOffsetDays(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2 flex justify-end gap-2">
              {addItem.isError ? <FormError error={addItem.error} /> : null}
              <Button
                size="sm"
                loading={addItem.isPending}
                disabled={!title.trim()}
                onClick={() => addItem.mutate()}
              >
                Save task
              </Button>
            </div>
          </div>
        ) : null}

        {template.items && template.items.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {template.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                      {item.category}
                    </span>
                    <span>{assigneeLabel(item.assigneeRole)}</span>
                    <span>
                      Due {item.dueOffsetDays >= 0 ? `+${item.dueOffsetDays}` : item.dueOffsetDays}d
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => removeItem.mutate(item.id)}
                  className="text-slate-300 hover:text-red-600"
                  aria-label={`Remove "${item.title}"`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-slate-500">No tasks in this template yet.</p>
        )}
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared error states
// ---------------------------------------------------------------------------

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Card>
      <CardBody>
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load this"
          description={errorMessage(error)}
        />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function FormError({ error }: { error: unknown }) {
  return <p className="text-xs text-red-600">{errorMessage(error)}</p>;
}
