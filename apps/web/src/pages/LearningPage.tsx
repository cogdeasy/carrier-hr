import type {
  ComplianceReport,
  Course,
  CourseEnrollment,
  Employee,
  Paginated,
  TeamEnrollment,
} from '@collins-hr/shared';
import { COURSE_CATEGORIES } from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Lock,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Badge, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage, Spinner } from '../components/ui/Spinner';
import { StatCard } from '../components/ui/StatCard';
import { TBody, TD, TH, THead, TR, Table } from '../components/ui/Table';
import { ApiError, api } from '../lib/api';
import { formatDate, formatDuration, relativeDays, titleCase } from '../lib/format';

type Tab = 'catalog' | 'mine' | 'assignments' | 'compliance';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Please try again.';
}

function ErrorBanner({ error }: { error: unknown }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {errorMessage(error)}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-collins-600" style={{ width: `${value}%` }} />
    </div>
  );
}

export function LearningPage() {
  const { can } = useAuth();
  const canManageTeam = can('learning:read:team');
  const canAdmin = can('learning:admin');
  const canAssign = can('learning:assign');

  const [tab, setTab] = useState<Tab>('catalog');
  const [courseForm, setCourseForm] = useState<{ open: boolean; course: Course | null }>({
    open: false,
    course: null,
  });
  const [assignCourse, setAssignCourse] = useState<Course | null>(null);

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'catalog', label: 'Catalog', show: true },
    { id: 'mine', label: 'My learning', show: true },
    { id: 'assignments', label: 'Assignments', show: true },
    { id: 'compliance', label: 'Compliance', show: canManageTeam },
  ];

  return (
    <div>
      <PageHeader
        title="Learning & Development"
        description="Grow your skills with Collins Aerospace University."
        actions={
          canAdmin ? (
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setCourseForm({ open: true, course: null })}
            >
              New course
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 border-b border-slate-200" role="tablist" aria-label="Learning views">
        <div className="flex gap-1 overflow-x-auto">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={
                  tab === t.id
                    ? 'border-b-2 border-collins-600 px-4 py-2 text-sm font-semibold text-collins-700'
                    : 'border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800'
                }
              >
                {t.label}
              </button>
            ))}
        </div>
      </div>

      {tab === 'catalog' ? (
        <CatalogTab
          canAdmin={canAdmin}
          canAssign={canAssign}
          onEdit={(course) => setCourseForm({ open: true, course })}
          onAssign={(course) => setAssignCourse(course)}
        />
      ) : null}
      {tab === 'mine' ? <MyLearningTab /> : null}
      {tab === 'assignments' ? <AssignmentsTab /> : null}
      {tab === 'compliance' && canManageTeam ? <ComplianceTab /> : null}

      {courseForm.open ? (
        <CourseFormModal
          course={courseForm.course}
          onClose={() => setCourseForm({ open: false, course: null })}
        />
      ) : null}
      {assignCourse ? (
        <AssignModal
          course={assignCourse}
          canAdmin={canAdmin}
          onClose={() => setAssignCourse(null)}
        />
      ) : null}
    </div>
  );
}

function useEnrollments() {
  return useQuery({
    queryKey: ['learning', 'enrollments'],
    queryFn: () => api.get<CourseEnrollment[]>('/learning/enrollments'),
  });
}

function CatalogTab({
  canAdmin,
  canAssign,
  onEdit,
  onAssign,
}: {
  canAdmin: boolean;
  canAssign: boolean;
  onEdit: (course: Course) => void;
  onAssign: (course: Course) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [required, setRequired] = useState('');
  const [sort, setSort] = useState('title');
  const [detail, setDetail] = useState<Course | null>(null);

  const coursesQuery = useQuery({
    queryKey: ['learning', 'courses', { search, category, required, sort }],
    queryFn: () =>
      api.get<Course[]>('/learning/courses', {
        search: search || undefined,
        category: category || undefined,
        required: required || undefined,
        sort,
      }),
  });
  const enrollmentsQuery = useEnrollments();

  const enrollmentByCourse = useMemo(
    () => new Map((enrollmentsQuery.data ?? []).map((e) => [e.courseId, e])),
    [enrollmentsQuery.data],
  );
  const completedCourseIds = useMemo(
    () =>
      new Set(
        (enrollmentsQuery.data ?? [])
          .filter((e) => e.status === 'completed')
          .map((e) => e.courseId),
      ),
    [enrollmentsQuery.data],
  );

  const enroll = useMutation({
    mutationFn: (courseId: string) => api.post('/learning/enrollments', { courseId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['learning'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/learning/enrollments/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['learning'] }),
  });

  const courses = coursesQuery.data ?? [];

  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Search">
          <Input
            type="search"
            placeholder="Search courses…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {COURSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={required} onChange={(e) => setRequired(e.target.value)}>
            <option value="">All courses</option>
            <option value="true">Required only</option>
            <option value="false">Electives only</option>
          </Select>
        </Field>
        <Field label="Sort by">
          <Select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="title">Title</option>
            <option value="duration">Duration</option>
            <option value="recent">Newest</option>
          </Select>
        </Field>
      </div>

      {enroll.isError ? (
        <div className="mb-4">
          <ErrorBanner error={enroll.error} />
        </div>
      ) : null}

      {coursesQuery.isLoading ? (
        <LoadingPage />
      ) : coursesQuery.isError ? (
        <ErrorBanner error={coursesQuery.error} />
      ) : courses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No courses found"
          description="Try adjusting your filters to see more of the catalog."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              enrollment={enrollmentByCourse.get(course.id)}
              completedCourseIds={completedCourseIds}
              canAssign={canAssign}
              enrolling={enroll.isPending}
              onEnroll={() => enroll.mutate(course.id)}
              onUnenroll={(id) => remove.mutate(id)}
              onOpen={() => setDetail(course)}
              onAssign={() => onAssign(course)}
            />
          ))}
        </div>
      )}

      {detail ? (
        <CourseDetailModal
          course={detail}
          enrollment={enrollmentByCourse.get(detail.id)}
          completedCourseIds={completedCourseIds}
          canAdmin={canAdmin}
          canAssign={canAssign}
          enrolling={enroll.isPending}
          onEnroll={() => enroll.mutate(detail.id)}
          onEdit={() => {
            onEdit(detail);
            setDetail(null);
          }}
          onAssign={() => {
            onAssign(detail);
            setDetail(null);
          }}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </div>
  );
}

function missingPrereqs(course: Course, completed: Set<string>): string[] {
  return course.prerequisites.filter((p) => !completed.has(p.id)).map((p) => p.title);
}

function CourseCard({
  course,
  enrollment,
  completedCourseIds,
  canAssign,
  enrolling,
  onEnroll,
  onUnenroll,
  onOpen,
  onAssign,
}: {
  course: Course;
  enrollment?: CourseEnrollment;
  completedCourseIds: Set<string>;
  canAssign: boolean;
  enrolling: boolean;
  onEnroll: () => void;
  onUnenroll: (id: string) => void;
  onOpen: () => void;
  onAssign: () => void;
}) {
  const blocked = missingPrereqs(course, completedCourseIds);
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={
          <button onClick={onOpen} className="text-left hover:text-collins-700">
            {course.title}
          </button>
        }
        subtitle={`${course.provider} · ${formatDuration(course.durationMinutes)}`}
        action={
          course.required ? <Badge tone="warning">Required</Badge> : <Badge>Elective</Badge>
        }
      />
      <CardBody className="flex flex-1 flex-col">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge tone="collins">{course.category}</Badge>
          {course.prerequisites.length > 0 ? (
            <Badge tone="neutral">
              {course.prerequisites.length} prerequisite
              {course.prerequisites.length > 1 ? 's' : ''}
            </Badge>
          ) : null}
        </div>
        <p className="line-clamp-3 text-sm text-slate-600">{course.description}</p>

        <div className="mt-auto pt-4">
          {enrollment ? (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <Badge tone={enrollment.overdue ? 'danger' : statusTone(enrollment.status)}>
                  {enrollment.overdue ? 'Overdue' : titleCase(enrollment.status)}
                </Badge>
                <span>{enrollment.progress}%</span>
              </div>
              <div className="mt-2">
                <ProgressBar value={enrollment.progress} />
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={onOpen}>
                  View
                </Button>
                {!enrollment.required && enrollment.status !== 'completed' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Drop ${course.title}`}
                    onClick={() => onUnenroll(enrollment.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          ) : blocked.length > 0 ? (
            <div>
              <p className="mb-2 flex items-center gap-1 text-xs text-slate-500">
                <Lock className="h-3.5 w-3.5" /> Requires: {blocked.join(', ')}
              </p>
              <Button size="sm" variant="outline" className="w-full" disabled>
                Locked
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                leftIcon={<GraduationCap className="h-4 w-4" />}
                loading={enrolling}
                onClick={onEnroll}
              >
                Enroll
              </Button>
              {canAssign ? (
                <Button size="sm" variant="outline" onClick={onAssign}>
                  Assign
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function CourseDetailModal({
  course,
  enrollment,
  completedCourseIds,
  canAdmin,
  canAssign,
  enrolling,
  onEnroll,
  onEdit,
  onAssign,
  onClose,
}: {
  course: Course;
  enrollment?: CourseEnrollment;
  completedCourseIds: Set<string>;
  canAdmin: boolean;
  canAssign: boolean;
  enrolling: boolean;
  onEnroll: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onClose: () => void;
}) {
  const blocked = missingPrereqs(course, completedCourseIds);
  return (
    <Modal
      open
      onClose={onClose}
      title={course.title}
      footer={
        <>
          {canAdmin ? (
            <Button variant="outline" onClick={onEdit}>
              Edit course
            </Button>
          ) : null}
          {canAssign ? (
            <Button variant="outline" onClick={onAssign}>
              Assign to team
            </Button>
          ) : null}
          {!enrollment ? (
            <Button loading={enrolling} disabled={blocked.length > 0} onClick={onEnroll}>
              {blocked.length > 0 ? 'Prerequisites required' : 'Enroll'}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone="collins">{course.category}</Badge>
          {course.required ? <Badge tone="warning">Required</Badge> : <Badge>Elective</Badge>}
          <Badge tone="neutral">{formatDuration(course.durationMinutes)}</Badge>
        </div>
        <p className="text-sm text-slate-600">{course.description}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-slate-400">Provider</dt>
            <dd className="text-slate-700">{course.provider}</dd>
          </div>
          {course.enrollmentCount !== undefined ? (
            <div>
              <dt className="text-xs text-slate-400">Learners enrolled</dt>
              <dd className="text-slate-700">{course.enrollmentCount}</dd>
            </div>
          ) : null}
        </dl>

        {course.prerequisites.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Prerequisites
            </p>
            <ul className="space-y-1">
              {course.prerequisites.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                  {completedCourseIds.has(p.id) ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Lock className="h-4 w-4 text-slate-400" />
                  )}
                  {p.title}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {enrollment ? (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between text-sm">
              <Badge tone={enrollment.overdue ? 'danger' : statusTone(enrollment.status)}>
                {enrollment.overdue ? 'Overdue' : titleCase(enrollment.status)}
              </Badge>
              <span className="text-slate-500">{enrollment.progress}%</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={enrollment.progress} />
            </div>
            {enrollment.certificateSerial ? (
              <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
                <Award className="h-4 w-4" /> Certificate {enrollment.certificateSerial}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function useUpdateProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, progress }: { id: string; progress: number }) =>
      api.patch<CourseEnrollment>(`/learning/enrollments/${id}`, { progress }),
    onMutate: async ({ id, progress }) => {
      await qc.cancelQueries({ queryKey: ['learning', 'enrollments'] });
      const previous = qc.getQueryData<CourseEnrollment[]>(['learning', 'enrollments']);
      qc.setQueryData<CourseEnrollment[]>(['learning', 'enrollments'], (old) =>
        (old ?? []).map((e) =>
          e.id === id
            ? {
                ...e,
                progress,
                status:
                  progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started',
              }
            : e,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['learning', 'enrollments'], ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['learning'] }),
  });
}

function EnrollmentRow({ enrollment }: { enrollment: CourseEnrollment }) {
  const qc = useQueryClient();
  const updateProgress = useUpdateProgress();
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/learning/enrollments/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['learning'] }),
  });
  const course = enrollment.course;

  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-slate-900">{course?.title ?? 'Course'}</p>
            <p className="text-xs text-slate-500">
              {course ? `${course.provider} · ${formatDuration(course.durationMinutes)}` : null}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone={enrollment.overdue ? 'danger' : statusTone(enrollment.status)}>
              {enrollment.overdue ? 'Overdue' : titleCase(enrollment.status)}
            </Badge>
            {enrollment.required ? <Badge tone="warning">Required</Badge> : null}
          </div>
        </div>

        {enrollment.dueDate ? (
          <p
            className={`mt-2 flex items-center gap-1 text-xs ${
              enrollment.overdue ? 'text-red-600' : 'text-slate-500'
            }`}
          >
            <Clock className="h-3.5 w-3.5" /> Due {formatDate(enrollment.dueDate)} (
            {relativeDays(enrollment.dueDate)})
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar value={enrollment.progress} />
          </div>
          <span className="w-10 text-right text-xs text-slate-500">{enrollment.progress}%</span>
        </div>

        {enrollment.certificateSerial ? (
          <p className="mt-3 flex items-center gap-1 text-xs text-emerald-700">
            <Award className="h-4 w-4" /> Certificate {enrollment.certificateSerial}
            {enrollment.completedAt ? ` · ${formatDate(enrollment.completedAt)}` : ''}
          </p>
        ) : enrollment.status !== 'completed' ? (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              loading={updateProgress.isPending}
              onClick={() =>
                updateProgress.mutate({
                  id: enrollment.id,
                  progress: Math.min(100, enrollment.progress + 25),
                })
              }
            >
              Continue
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => updateProgress.mutate({ id: enrollment.id, progress: 100 })}
            >
              Mark complete
            </Button>
            {!enrollment.required ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Drop course"
                onClick={() => remove.mutate(enrollment.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function MyLearningTab() {
  const enrollmentsQuery = useEnrollments();
  if (enrollmentsQuery.isLoading) return <LoadingPage />;
  if (enrollmentsQuery.isError) return <ErrorBanner error={enrollmentsQuery.error} />;
  const enrollments = enrollmentsQuery.data ?? [];

  if (enrollments.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="You're not enrolled in anything yet"
        description="Browse the catalog to enroll in your first course."
      />
    );
  }

  const completed = enrollments.filter((e) => e.status === 'completed').length;
  const inProgress = enrollments.filter((e) => e.status === 'in_progress').length;

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Enrolled" value={enrollments.length} icon={BookOpen} />
        <StatCard label="In progress" value={inProgress} icon={Clock} />
        <StatCard label="Completed" value={completed} icon={Award} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {enrollments.map((e) => (
          <EnrollmentRow key={e.id} enrollment={e} />
        ))}
      </div>
    </div>
  );
}

function AssignmentsTab() {
  const enrollmentsQuery = useEnrollments();
  if (enrollmentsQuery.isLoading) return <LoadingPage />;
  if (enrollmentsQuery.isError) return <ErrorBanner error={enrollmentsQuery.error} />;
  const assignments = (enrollmentsQuery.data ?? []).filter((e) => e.required);

  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No required training assigned"
        description="You're all caught up — no mandatory courses are due."
      />
    );
  }

  const overdue = assignments.filter((e) => e.overdue).length;
  const done = assignments.filter((e) => e.status === 'completed').length;

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Assigned" value={assignments.length} icon={ShieldCheck} />
        <StatCard label="Completed" value={done} icon={CheckCircle2} />
        <StatCard label="Overdue" value={overdue} icon={AlertTriangle} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {assignments.map((e) => (
          <EnrollmentRow key={e.id} enrollment={e} />
        ))}
      </div>
    </div>
  );
}

function ComplianceTab() {
  const report = useQuery({
    queryKey: ['learning', 'compliance'],
    queryFn: () => api.get<ComplianceReport>('/learning/compliance'),
  });
  if (report.isLoading) return <LoadingPage />;
  if (report.isError) return <ErrorBanner error={report.error} />;
  const data = report.data!;

  if (data.summary.assigned === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No required training tracked yet"
        description="Assign required courses to start tracking compliance."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Compliance" value={`${data.summary.compliancePct}%`} icon={ShieldCheck} />
        <StatCard label="People tracked" value={data.summary.employees} icon={Users} />
        <StatCard label="Completed" value={data.summary.completed} icon={CheckCircle2} />
        <StatCard label="Overdue" value={data.summary.overdue} icon={AlertTriangle} />
      </div>

      <Card>
        <CardHeader title="Overdue training" subtitle="Required courses past their due date" />
        <CardBody className="p-0">
          {data.overdue.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={CheckCircle2} title="Nobody is overdue" />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Course</TH>
                  <TH>Department</TH>
                  <TH>Due</TH>
                  <TH>Progress</TH>
                </TR>
              </THead>
              <TBody>
                {data.overdue.map((e: TeamEnrollment) => (
                  <TR key={e.id}>
                    <TD className="font-medium text-slate-900">{e.employee.displayName}</TD>
                    <TD>{e.course?.title ?? '—'}</TD>
                    <TD>{e.employee.department}</TD>
                    <TD className="text-red-600">
                      {formatDate(e.dueDate)} ({relativeDays(e.dueDate ?? '')})
                    </TD>
                    <TD>{e.progress}%</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By course" />
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Course</TH>
                  <TH>Completed</TH>
                  <TH>Overdue</TH>
                  <TH>Compliance</TH>
                </TR>
              </THead>
              <TBody>
                {data.byCourse.map((c) => (
                  <TR key={c.course.id}>
                    <TD className="font-medium text-slate-900">{c.course.title}</TD>
                    <TD>
                      {c.completed}/{c.assigned}
                    </TD>
                    <TD>{c.overdue}</TD>
                    <TD>
                      <Badge tone={c.compliancePct >= 90 ? 'success' : c.compliancePct >= 60 ? 'warning' : 'danger'}>
                        {c.compliancePct}%
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="By person" />
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Employee</TH>
                  <TH>Completed</TH>
                  <TH>Overdue</TH>
                  <TH>Compliance</TH>
                </TR>
              </THead>
              <TBody>
                {data.byEmployee.map((r) => (
                  <TR key={r.employee.id}>
                    <TD className="font-medium text-slate-900">{r.employee.displayName}</TD>
                    <TD>
                      {r.completed}/{r.assigned}
                    </TD>
                    <TD>{r.overdue}</TD>
                    <TD>
                      <Badge tone={r.compliancePct >= 90 ? 'success' : r.compliancePct >= 60 ? 'warning' : 'danger'}>
                        {r.compliancePct}%
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function CourseFormModal({ course, onClose }: { course: Course | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = course !== null;
  const [title, setTitle] = useState(course?.title ?? '');
  const [category, setCategory] = useState<string>(course?.category ?? COURSE_CATEGORIES[0]);
  const [description, setDescription] = useState(course?.description ?? '');
  const [provider, setProvider] = useState(course?.provider ?? 'Collins Aerospace University');
  const [duration, setDuration] = useState(String(course?.durationMinutes ?? 30));
  const [required, setRequired] = useState(course?.required ?? false);
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>(course?.prerequisiteIds ?? []);

  const allCourses = useQuery({
    queryKey: ['learning', 'courses', 'all'],
    queryFn: () => api.get<Course[]>('/learning/courses', { sort: 'title' }),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title,
        category,
        description,
        provider,
        durationMinutes: Number(duration),
        required,
        prerequisiteIds,
      };
      return editing
        ? api.patch(`/learning/courses/${course!.id}`, body)
        : api.post('/learning/courses', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['learning'] });
      onClose();
    },
  });

  const prereqOptions = (allCourses.data ?? []).filter((c) => c.id !== course?.id);

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit course' : 'New course'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            disabled={title.trim().length < 2 || description.trim().length < 2}
            onClick={() => save.mutate()}
          >
            {editing ? 'Save changes' : 'Create course'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.isError ? <ErrorBanner error={save.error} /> : null}
        <Field label="Title" htmlFor="course-title">
          <Input id="course-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="course-category">
            <Select
              id="course-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {COURSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duration (minutes)" htmlFor="course-duration">
            <Input
              id="course-duration"
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Provider" htmlFor="course-provider">
          <Input id="course-provider" value={provider} onChange={(e) => setProvider(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="course-description">
          <Textarea
            id="course-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          Required for all employees
        </label>
        <Field label="Prerequisites" htmlFor="course-prereqs">
          <select
            id="course-prereqs"
            multiple
            className="input h-32"
            value={prerequisiteIds}
            onChange={(e) =>
              setPrerequisiteIds(Array.from(e.target.selectedOptions, (o) => o.value))
            }
          >
            {prereqOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function AssignModal({
  course,
  canAdmin,
  onClose,
}: {
  course: Course;
  canAdmin: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');

  const peopleQuery = useQuery({
    queryKey: ['learning', 'assignable', canAdmin, user?.employeeId],
    queryFn: () =>
      canAdmin
        ? api
            .get<Paginated<Employee>>('/employees', { pageSize: 100 })
            .then((p) => p.data as { id: string; displayName: string; department: string }[])
        : api.get<{ id: string; displayName: string; department: string }[]>(
            `/employees/${user!.employeeId}/reports`,
          ),
  });

  const assign = useMutation({
    mutationFn: () =>
      api.post('/learning/assignments', {
        courseId: course.id,
        employeeIds: selected,
        dueDate: dueDate || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['learning'] });
      onClose();
    },
  });

  const people = (peopleQuery.data ?? []).filter((p) =>
    p.displayName.toLowerCase().includes(search.toLowerCase()),
  );
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Modal
      open
      onClose={onClose}
      title={`Assign: ${course.title}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={assign.isPending}
            disabled={selected.length === 0}
            onClick={() => assign.mutate()}
          >
            Assign to {selected.length || 0}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {assign.isError ? <ErrorBanner error={assign.error} /> : null}
        <Field label="Due date (optional)" htmlFor="assign-due">
          <Input
            id="assign-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
        <Field label="Search people" htmlFor="assign-search">
          <Input
            id="assign-search"
            type="search"
            placeholder="Filter by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
          {peopleQuery.isLoading ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : people.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No people found.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {people.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="font-medium text-slate-800">{p.displayName}</span>
                    <span className="ml-auto text-xs text-slate-400">{p.department}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
