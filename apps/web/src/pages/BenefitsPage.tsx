import type {
  AdminEnrollment,
  BenefitEnrollment,
  BenefitPlan,
  CostSummary,
  CoverageTier,
  Dependent,
  DependentRelationship,
  EnrollmentEligibility,
  EnrollmentPeriod,
  PaginatedEnrollments,
  QualifyingLifeEvent,
  QualifyingLifeEventType,
} from '@collins-hr/shared';
import {
  COVERAGE_TIER_LABELS,
  COVERAGE_TIERS,
  DEPENDENT_RELATIONSHIPS,
  QLE_TYPES,
  TIERS_REQUIRING_DEPENDENTS,
} from '@collins-hr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarClock,
  CalendarHeart,
  HeartPulse,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, type BadgeTone, statusTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Field, Input, Select } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingPage } from '../components/ui/Spinner';
import { StatCard } from '../components/ui/StatCard';
import { TBody, TH, THead, TR, Table } from '../components/ui/Table';
import { useAuth } from '../auth/AuthContext';
import { ApiError, api } from '../lib/api';
import { formatCents, formatDate, titleCase } from '../lib/format';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

function coverageStateTone(state: BenefitEnrollment['coverageState']): BadgeTone {
  switch (state) {
    case 'current':
      return 'success';
    case 'pending':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function BenefitsPage() {
  const { can } = useAuth();
  const isHrAdmin = can('benefits:admin');
  const [tab, setTab] = useState<'me' | 'admin'>('me');

  return (
    <div>
      <PageHeader
        title="Benefits"
        description="Compare plans, manage your elections, and track what you pay each paycheck."
        actions={
          isHrAdmin ? (
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setTab('me')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === 'me' ? 'bg-collins-600 text-white' : 'text-slate-600'
                }`}
              >
                My benefits
              </button>
              <button
                type="button"
                onClick={() => setTab('admin')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === 'admin' ? 'bg-collins-600 text-white' : 'text-slate-600'
                }`}
              >
                HR administration
              </button>
            </div>
          ) : null
        }
      />

      {isHrAdmin && tab === 'admin' ? <AdminBenefits /> : <MyBenefits />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee self-service
// ---------------------------------------------------------------------------

function MyBenefits() {
  const [wizardPlan, setWizardPlan] = useState<BenefitPlan | null>(null);

  const plansQuery = useQuery({
    queryKey: ['benefits', 'plans'],
    queryFn: () => api.get<BenefitPlan[]>('/benefits/plans'),
  });
  const enrollmentsQuery = useQuery({
    queryKey: ['benefits', 'enrollments'],
    queryFn: () => api.get<BenefitEnrollment[]>('/benefits/enrollments'),
  });
  const eligibilityQuery = useQuery({
    queryKey: ['benefits', 'eligibility'],
    queryFn: () => api.get<EnrollmentEligibility>('/benefits/eligibility'),
  });
  const summaryQuery = useQuery({
    queryKey: ['benefits', 'summary'],
    queryFn: () => api.get<CostSummary>('/benefits/summary'),
  });

  if (plansQuery.isLoading || enrollmentsQuery.isLoading) return <LoadingPage />;

  if (plansQuery.isError || enrollmentsQuery.isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="We couldn't load your benefits"
        description={errorMessage(plansQuery.error ?? enrollmentsQuery.error)}
      />
    );
  }

  const plans = plansQuery.data ?? [];
  const enrollments = enrollmentsQuery.data ?? [];
  const eligibility = eligibilityQuery.data;
  const summary = summaryQuery.data;
  const byPlan = new Map(enrollments.map((e) => [e.planId, e]));

  return (
    <div className="space-y-8">
      <EligibilityBanner eligibility={eligibility} />

      {summary ? <CostSummaryCards summary={summary} /> : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Plan catalog</h2>
        {plans.length === 0 ? (
          <EmptyState
            icon={HeartPulse}
            title="No plans available"
            description="There are no benefit plans published for the current plan year yet."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                enrollment={byPlan.get(plan.id)}
                canEnroll={eligibility?.canEnroll ?? false}
                onManage={() => setWizardPlan(plan)}
              />
            ))}
          </div>
        )}
      </section>

      <DependentsSection />

      <LifeEventsSection />

      {wizardPlan ? (
        <EnrollmentWizard
          plan={wizardPlan}
          enrollment={byPlan.get(wizardPlan.id)}
          eligibility={eligibility}
          onClose={() => setWizardPlan(null)}
        />
      ) : null}
    </div>
  );
}

function EligibilityBanner({ eligibility }: { eligibility?: EnrollmentEligibility }) {
  if (!eligibility) return null;
  const fmtWindow = (p: EnrollmentPeriod) =>
    `${formatDate(p.startsAt)} – ${formatDate(p.endsAt)}`;

  if (eligibility.reason === 'open_enrollment' && eligibility.openPeriod) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CalendarHeart className="mt-0.5 h-5 w-5 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">
            {eligibility.openPeriod.name} is open
          </p>
          <p className="text-sm text-emerald-700">
            You can enroll, change, or waive coverage through {fmtWindow(eligibility.openPeriod)}.
          </p>
        </div>
      </div>
    );
  }

  if (eligibility.reason === 'qualifying_life_event' && eligibility.activeLifeEvent) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-collins-200 bg-collins-50 px-4 py-3">
        <CalendarClock className="mt-0.5 h-5 w-5 text-collins-600" />
        <div>
          <p className="text-sm font-semibold text-collins-800">
            Special enrollment open from your {titleCase(eligibility.activeLifeEvent.type)} event
          </p>
          <p className="text-sm text-collins-700">
            Make your changes by {formatDate(eligibility.activeLifeEvent.windowEndsAt)}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <CalendarClock className="mt-0.5 h-5 w-5 text-amber-600" />
      <div>
        <p className="text-sm font-semibold text-amber-800">Enrollment is currently closed</p>
        <p className="text-sm text-amber-700">
          You can only change benefits during open enrollment or after a qualifying life event
          (marriage, birth, loss of other coverage, etc.). Report a life event below to request a
          special enrollment.
        </p>
      </div>
    </div>
  );
}

function CostSummaryCards({ summary }: { summary: CostSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Per paycheck"
        value={formatCents(summary.perPaycheckEmployeeCents)}
        hint={`${summary.payPeriodsPerYear} pay periods / year`}
      />
      <StatCard label="Your cost / month" value={formatCents(summary.monthlyEmployeeCents)} />
      <StatCard
        label="Collins pays / month"
        value={formatCents(summary.monthlyEmployerCents)}
        hint="Employer contribution"
      />
    </div>
  );
}

function PlanCard({
  plan,
  enrollment,
  canEnroll,
  onManage,
}: {
  plan: BenefitPlan;
  enrollment?: BenefitEnrollment;
  canEnroll: boolean;
  onManage: () => void;
}) {
  const lowestEmployeeCost = plan.tiers.length
    ? Math.min(...plan.tiers.map((t) => Math.max(0, t.monthlyPremiumCents - t.employerContributionCents)))
    : Math.max(0, plan.monthlyPremiumCents - plan.employerContributionCents);

  return (
    <Card>
      <CardHeader
        title={plan.name}
        subtitle={`${plan.carrier} · ${titleCase(plan.type)}`}
        action={
          enrollment ? (
            <Badge tone={statusTone(enrollment.status)}>{titleCase(enrollment.status)}</Badge>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-collins-50 text-collins-700">
              <HeartPulse className="h-4 w-4" />
            </span>
          )
        }
      />
      <CardBody>
        <p className="text-sm text-slate-600">{plan.description}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">From (your cost)</dt>
            <dd className="font-medium text-slate-700">{formatCents(lowestEmployeeCost)}/mo</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Coverage tiers</dt>
            <dd className="font-medium text-slate-700">{plan.tiers.length || 1}</dd>
          </div>
          {enrollment && enrollment.status === 'enrolled' ? (
            <>
              <div className="flex justify-between">
                <dt className="text-slate-500">Your tier</dt>
                <dd className="font-medium text-slate-700">
                  {COVERAGE_TIER_LABELS[enrollment.coverageTier]}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <Badge tone={coverageStateTone(enrollment.coverageState)}>
                    {titleCase(enrollment.coverageState)}
                    {enrollment.effectiveDate ? ` · ${formatDate(enrollment.effectiveDate)}` : ''}
                  </Badge>
                </dd>
              </div>
            </>
          ) : null}
        </dl>
        <div className="mt-4">
          <Button
            size="sm"
            className="w-full"
            variant={enrollment?.status === 'enrolled' ? 'outline' : 'primary'}
            disabled={!canEnroll}
            title={canEnroll ? undefined : 'Enrollment is closed'}
            onClick={onManage}
          >
            {enrollment ? 'Change election' : 'Enroll'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function EnrollmentWizard({
  plan,
  enrollment,
  eligibility,
  onClose,
}: {
  plan: BenefitPlan;
  enrollment?: BenefitEnrollment;
  eligibility?: EnrollmentEligibility;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const dependentsQuery = useQuery({
    queryKey: ['benefits', 'dependents'],
    queryFn: () => api.get<Dependent[]>('/benefits/dependents'),
  });
  const dependents = dependentsQuery.data ?? [];

  const [tier, setTier] = useState<CoverageTier>(enrollment?.coverageTier ?? 'employee_only');
  const [selectedDeps, setSelectedDeps] = useState<string[]>(enrollment?.dependentIds ?? []);

  const tierInfo = plan.tiers.find((t) => t.tier === tier);
  const employeeCost = tierInfo
    ? Math.max(0, tierInfo.monthlyPremiumCents - tierInfo.employerContributionCents)
    : 0;
  const needsDependents = TIERS_REQUIRING_DEPENDENTS.includes(tier);

  const mutate = useMutation({
    mutationFn: (status: 'enrolled' | 'waived') =>
      api.post<BenefitEnrollment>('/benefits/enrollments', {
        planId: plan.id,
        status,
        coverageTier: status === 'waived' ? 'employee_only' : tier,
        dependentIds: status === 'waived' ? [] : selectedDeps,
        qleId: eligibility?.activeLifeEvent?.id,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['benefits'] });
      onClose();
    },
  });

  const availableTiers: CoverageTier[] = plan.tiers.length
    ? plan.tiers.map((t) => t.tier)
    : [...COVERAGE_TIERS];
  const dependentError = needsDependents && selectedDeps.length === 0;

  function toggleDep(id: string) {
    setSelectedDeps((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Enroll · ${plan.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            loading={mutate.isPending}
            onClick={() => mutate.mutate('waived')}
          >
            Waive
          </Button>
          <Button
            loading={mutate.isPending}
            disabled={dependentError || !tierInfo}
            onClick={() => mutate.mutate('enrolled')}
          >
            Confirm election
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Coverage tier" htmlFor="tier">
          <Select id="tier" value={tier} onChange={(e) => setTier(e.target.value as CoverageTier)}>
            {availableTiers.map((t) => (
              <option key={t} value={t}>
                {COVERAGE_TIER_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>

        {needsDependents ? (
          <div>
            <p className="label">Covered dependents</p>
            {dependents.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                You need to add a dependent before choosing this tier. Close this dialog and use
                “Add dependent” below.
              </p>
            ) : (
              <ul className="space-y-1">
                {dependents.map((dep) => (
                  <li key={dep.id}>
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedDeps.includes(dep.id)}
                        onChange={() => toggleDep(dep.id)}
                      />
                      <span>
                        {dep.firstName} {dep.lastName}{' '}
                        <span className="text-slate-400">· {titleCase(dep.relationship)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {dependentError ? (
              <p className="mt-1 text-xs text-red-600">Select at least one dependent for this tier.</p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Monthly premium</span>
            <span className="font-medium">{formatCents(tierInfo?.monthlyPremiumCents ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Collins contributes</span>
            <span className="font-medium text-emerald-600">
              {formatCents(tierInfo?.employerContributionCents ?? 0)}
            </span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
            <span className="font-semibold text-slate-700">Your cost / month</span>
            <span className="font-semibold text-slate-900">{formatCents(employeeCost)}</span>
          </div>
        </div>

        {mutate.isError ? <p className="text-sm text-red-600">{errorMessage(mutate.error)}</p> : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Dependents
// ---------------------------------------------------------------------------

function DependentsSection() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Dependent | 'new' | null>(null);
  const { data: dependents = [], isLoading } = useQuery({
    queryKey: ['benefits', 'dependents'],
    queryFn: () => api.get<Dependent[]>('/benefits/dependents'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/benefits/dependents/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['benefits'] }),
  });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Dependents</h2>
        <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
          <Plus className="mr-1 h-4 w-4" /> Add dependent
        </Button>
      </div>

      {isLoading ? null : dependents.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No dependents on file"
          description="Add a spouse, partner, or child to cover them under your elections."
        />
      ) : (
        <Card>
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Relationship</TH>
                  <TH>Date of birth</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {dependents.map((dep) => (
                  <TR key={dep.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {dep.firstName} {dep.lastName}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{titleCase(dep.relationship)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(dep.dateOfBirth)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          aria-label={`Edit ${dep.firstName}`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          onClick={() => setEditing(dep)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${dep.firstName}`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => remove.mutate(dep.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      )}

      {remove.isError ? (
        <p className="mt-2 text-sm text-red-600">{errorMessage(remove.error)}</p>
      ) : null}

      {editing ? (
        <DependentModal
          dependent={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

function DependentModal({ dependent, onClose }: { dependent: Dependent | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState(dependent?.firstName ?? '');
  const [lastName, setLastName] = useState(dependent?.lastName ?? '');
  const [relationship, setRelationship] = useState<DependentRelationship>(
    dependent?.relationship ?? 'spouse',
  );
  const [dateOfBirth, setDateOfBirth] = useState(dependent?.dateOfBirth ?? '');

  const save = useMutation({
    mutationFn: () => {
      const body = { firstName, lastName, relationship, dateOfBirth };
      return dependent
        ? api.patch(`/benefits/dependents/${dependent.id}`, body)
        : api.post('/benefits/dependents', body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['benefits'] });
      onClose();
    },
  });

  const valid = firstName.trim() && lastName.trim() && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth);

  return (
    <Modal
      open
      onClose={onClose}
      title={dependent ? 'Edit dependent' : 'Add dependent'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" htmlFor="dep-first">
            <Input id="dep-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name" htmlFor="dep-last">
            <Input id="dep-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <Field label="Relationship" htmlFor="dep-rel">
          <Select
            id="dep-rel"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value as DependentRelationship)}
          >
            {DEPENDENT_RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {titleCase(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date of birth" htmlFor="dep-dob">
          <Input
            id="dep-dob"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
        </Field>
        {save.isError ? <p className="text-sm text-red-600">{errorMessage(save.error)}</p> : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Qualifying life events
// ---------------------------------------------------------------------------

function LifeEventsSection() {
  const [reporting, setReporting] = useState(false);
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['benefits', 'life-events'],
    queryFn: () => api.get<QualifyingLifeEvent[]>('/benefits/life-events'),
  });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Qualifying life events</h2>
        <Button size="sm" variant="outline" onClick={() => setReporting(true)}>
          <Plus className="mr-1 h-4 w-4" /> Report life event
        </Button>
      </div>

      {isLoading ? null : events.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No life events reported"
          description="Report a marriage, birth, adoption, or loss of coverage to open a special enrollment window."
        />
      ) : (
        <Card>
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Event</TH>
                  <TH>Date</TH>
                  <TH>Special enrollment ends</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {events.map((e) => (
                  <TR key={e.id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{titleCase(e.type)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(e.eventDate)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(e.windowEndsAt)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(e.status)}>{titleCase(e.status)}</Badge>
                    </td>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      )}

      {reporting ? <LifeEventModal onClose={() => setReporting(false)} /> : null}
    </section>
  );
}

function LifeEventModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<QualifyingLifeEventType>('marriage');
  const [eventDate, setEventDate] = useState('');
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () =>
      api.post('/benefits/life-events', { type, eventDate, note: note.trim() || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['benefits'] });
      onClose();
    },
  });

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(eventDate);

  return (
    <Modal
      open
      onClose={onClose}
      title="Report a qualifying life event"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
            Submit for review
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Event type" htmlFor="qle-type">
          <Select
            id="qle-type"
            value={type}
            onChange={(e) => setType(e.target.value as QualifyingLifeEventType)}
          >
            {QLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Event date" htmlFor="qle-date">
          <Input
            id="qle-date"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />
        </Field>
        <Field label="Note (optional)" htmlFor="qle-note">
          <Input id="qle-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">
          HR reviews each event. Once approved, you’ll have 30 days from the event date to update
          your elections.
        </p>
        {save.isError ? <p className="text-sm text-red-600">{errorMessage(save.error)}</p> : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// HR administration
// ---------------------------------------------------------------------------

function AdminBenefits() {
  const qc = useQueryClient();
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = useMemo(
    () => ({ type, status, search, page, pageSize: 20 }),
    [type, status, search, page],
  );

  const enrollmentsQuery = useQuery({
    queryKey: ['benefits', 'admin', 'enrollments', query],
    queryFn: () =>
      api.get<PaginatedEnrollments>('/benefits/admin/enrollments', {
        type: type || undefined,
        status: status || undefined,
        search: search || undefined,
        page,
        pageSize: 20,
      }),
  });

  const lifeEventsQuery = useQuery({
    queryKey: ['benefits', 'admin', 'life-events'],
    queryFn: () => api.get<QualifyingLifeEvent[]>('/benefits/admin/life-events'),
  });

  const decide = useMutation({
    mutationFn: ({ id, status: decision }: { id: string; status: 'approved' | 'denied' }) =>
      api.patch(`/benefits/admin/life-events/${id}`, { status: decision }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['benefits', 'admin'] }),
  });

  const pending = (lifeEventsQuery.data ?? []).filter((e) => e.status === 'pending');
  const result = enrollmentsQuery.data;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Life events awaiting review
          {pending.length ? (
            <span className="ml-2 inline-flex">
              <Badge tone="warning">{pending.length}</Badge>
            </span>
          ) : null}
        </h2>
        {pending.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No pending life events" />
        ) : (
          <Card>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Event</TH>
                    <TH>Date</TH>
                    <TH>Window ends</TH>
                    <TH className="text-right">Decision</TH>
                  </TR>
                </THead>
                <TBody>
                  {pending.map((e) => (
                    <TR key={e.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">{titleCase(e.type)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(e.eventDate)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(e.windowEndsAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            loading={decide.isPending}
                            onClick={() => decide.mutate({ id: e.id, status: 'denied' })}
                          >
                            Deny
                          </Button>
                          <Button
                            size="sm"
                            loading={decide.isPending}
                            onClick={() => decide.mutate({ id: e.id, status: 'approved' })}
                          >
                            Approve
                          </Button>
                        </div>
                      </td>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">All enrollments</h2>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Search employee" htmlFor="adm-search">
            <Input
              id="adm-search"
              placeholder="Name or employee #"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </Field>
          <Field label="Plan type" htmlFor="adm-type">
            <Select
              id="adm-type"
              value={type}
              onChange={(e) => {
                setPage(1);
                setType(e.target.value);
              }}
            >
              <option value="">All types</option>
              {['medical', 'dental', 'vision', 'life', 'disability', 'retirement_401k', 'hsa', 'fsa'].map(
                (t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field label="Status" htmlFor="adm-status">
            <Select
              id="adm-status"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">All statuses</option>
              <option value="enrolled">Enrolled</option>
              <option value="waived">Waived</option>
              <option value="pending">Pending</option>
            </Select>
          </Field>
        </div>

        {enrollmentsQuery.isError ? (
          <EmptyState
            icon={AlertCircle}
            title="Couldn't load enrollments"
            description={errorMessage(enrollmentsQuery.error)}
          />
        ) : !result || result.items.length === 0 ? (
          <EmptyState
            icon={HeartPulse}
            title="No enrollments match"
            description="Try clearing the filters above."
          />
        ) : (
          <Card>
            <CardBody className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Employee</TH>
                    <TH>Department</TH>
                    <TH>Plan</TH>
                    <TH>Tier</TH>
                    <TH>Status</TH>
                    <TH>Effective</TH>
                    <TH className="text-right">Your cost / mo</TH>
                  </TR>
                </THead>
                <TBody>
                  {result.items.map((e: AdminEnrollment) => (
                    <TR key={e.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{e.employeeName}</div>
                        <div className="text-xs text-slate-400">{e.employeeNumber}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{e.department}</td>
                      <td className="px-4 py-3 text-slate-600">{e.plan?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {COVERAGE_TIER_LABELS[e.coverageTier]}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(e.status)}>{titleCase(e.status)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(e.effectiveDate)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">
                        {formatCents(e.employeeCostCents)}
                      </td>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        )}

        {result && result.totalPages > 1 ? (
          <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
            <span>
              Page {result.page} of {result.totalPages} · {result.total} total
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= result.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
