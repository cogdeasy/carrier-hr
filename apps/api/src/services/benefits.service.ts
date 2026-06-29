import { and, eq, inArray } from 'drizzle-orm';
import type {
  AdminEnrollment,
  BenefitEnrollment,
  BenefitPlan,
  BenefitPlanTier,
  CostSummary,
  CostSummaryItem,
  CoverageTier,
  CreateDependentInput,
  CreateLifeEventInput,
  DecideLifeEventInput,
  Dependent,
  EnrollBenefitInput,
  EnrollmentEligibility,
  EnrollmentPeriod,
  ListEnrollmentsQuery,
  PaginatedEnrollments,
  QualifyingLifeEvent,
  UpdateDependentInput,
} from '@collins-hr/shared';
import { PAY_PERIODS_PER_YEAR, QLE_WINDOW_DAYS } from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import {
  benefitDependents,
  benefitEnrollments,
  benefitPlanTiers,
  benefitPlans,
  employees,
  enrollmentPeriods,
  qualifyingLifeEvents,
} from '../db/schema.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { isoToday, nowIso } from '../lib/dates.js';
import { createId } from '../lib/ids.js';
import { toBenefitEnrollment } from './mappers.js';

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

async function loadPlanMap(db: Database, planYear?: number): Promise<Map<string, BenefitPlan>> {
  const planRows = await db.select().from(benefitPlans);
  const tierRows = await db.select().from(benefitPlanTiers);
  const tiersByPlan = new Map<string, BenefitPlanTier[]>();
  for (const t of tierRows) {
    const list = tiersByPlan.get(t.planId) ?? [];
    list.push({
      tier: t.tier as CoverageTier,
      monthlyPremiumCents: t.monthlyPremiumCents,
      employerContributionCents: t.employerContributionCents,
    });
    tiersByPlan.set(t.planId, list);
  }
  const map = new Map<string, BenefitPlan>();
  for (const r of planRows) {
    if (planYear && r.planYear !== planYear) continue;
    map.set(r.id, {
      id: r.id,
      type: r.type as BenefitPlan['type'],
      name: r.name,
      carrier: r.carrier,
      description: r.description,
      monthlyPremiumCents: r.monthlyPremiumCents,
      employerContributionCents: r.employerContributionCents,
      coverageLevel: r.coverageLevel,
      planYear: r.planYear,
      tiers: tiersByPlan.get(r.id) ?? [],
    });
  }
  return map;
}

export async function listPlans(db: Database, planYear?: number): Promise<BenefitPlan[]> {
  const map = await loadPlanMap(db, planYear);
  return [...map.values()].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

function tierFor(plan: BenefitPlan | undefined, tier: CoverageTier): BenefitPlanTier | null {
  return plan?.tiers.find((t) => t.tier === tier) ?? null;
}

// ---------------------------------------------------------------------------
// Dependents
// ---------------------------------------------------------------------------

function toDependent(row: typeof benefitDependents.$inferSelect): Dependent {
  return {
    id: row.id,
    employeeId: row.employeeId,
    firstName: row.firstName,
    lastName: row.lastName,
    relationship: row.relationship as Dependent['relationship'],
    dateOfBirth: row.dateOfBirth,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listDependents(db: Database, employeeId: string): Promise<Dependent[]> {
  const rows = await db
    .select()
    .from(benefitDependents)
    .where(eq(benefitDependents.employeeId, employeeId));
  return rows
    .map(toDependent)
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}

export async function createDependent(
  db: Database,
  employeeId: string,
  input: CreateDependentInput,
): Promise<Dependent> {
  const id = createId('dep');
  await db.insert(benefitDependents).values({
    id,
    employeeId,
    firstName: input.firstName,
    lastName: input.lastName,
    relationship: input.relationship,
    dateOfBirth: input.dateOfBirth,
  });
  const [created] = await db
    .select()
    .from(benefitDependents)
    .where(eq(benefitDependents.id, id))
    .limit(1);
  return toDependent(created!);
}

async function getOwnDependent(
  db: Database,
  employeeId: string,
  id: string,
): Promise<typeof benefitDependents.$inferSelect> {
  const [row] = await db
    .select()
    .from(benefitDependents)
    .where(eq(benefitDependents.id, id))
    .limit(1);
  if (!row || row.employeeId !== employeeId) throw NotFound('Dependent not found');
  return row;
}

export async function updateDependent(
  db: Database,
  employeeId: string,
  id: string,
  input: UpdateDependentInput,
): Promise<Dependent> {
  await getOwnDependent(db, employeeId, id);
  await db
    .update(benefitDependents)
    .set({ ...input, updatedAt: nowIso() })
    .where(eq(benefitDependents.id, id));
  const [updated] = await db
    .select()
    .from(benefitDependents)
    .where(eq(benefitDependents.id, id))
    .limit(1);
  return toDependent(updated!);
}

export async function deleteDependent(db: Database, employeeId: string, id: string): Promise<void> {
  await getOwnDependent(db, employeeId, id);
  const covering = await db
    .select({ id: benefitEnrollments.id, dependentIds: benefitEnrollments.dependentIds })
    .from(benefitEnrollments)
    .where(eq(benefitEnrollments.employeeId, employeeId));
  if (covering.some((e) => (JSON.parse(e.dependentIds) as string[]).includes(id))) {
    throw BadRequest('Remove this dependent from your active elections before deleting them');
  }
  await db.delete(benefitDependents).where(eq(benefitDependents.id, id));
}

// ---------------------------------------------------------------------------
// Qualifying life events
// ---------------------------------------------------------------------------

function toLifeEvent(row: typeof qualifyingLifeEvents.$inferSelect): QualifyingLifeEvent {
  return {
    id: row.id,
    employeeId: row.employeeId,
    type: row.type as QualifyingLifeEvent['type'],
    eventDate: row.eventDate,
    status: row.status as QualifyingLifeEvent['status'],
    windowEndsAt: row.windowEndsAt,
    note: row.note,
    decidedById: row.decidedById,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function listLifeEvents(
  db: Database,
  filter: { employeeId?: string } = {},
): Promise<QualifyingLifeEvent[]> {
  const rows = filter.employeeId
    ? await db
        .select()
        .from(qualifyingLifeEvents)
        .where(eq(qualifyingLifeEvents.employeeId, filter.employeeId))
    : await db.select().from(qualifyingLifeEvents);
  return rows
    .map(toLifeEvent)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

export async function createLifeEvent(
  db: Database,
  employeeId: string,
  input: CreateLifeEventInput,
): Promise<QualifyingLifeEvent> {
  const id = createId('qle');
  await db.insert(qualifyingLifeEvents).values({
    id,
    employeeId,
    type: input.type,
    eventDate: input.eventDate,
    status: 'pending',
    windowEndsAt: addDays(input.eventDate, QLE_WINDOW_DAYS),
    note: input.note ?? null,
  });
  const [created] = await db
    .select()
    .from(qualifyingLifeEvents)
    .where(eq(qualifyingLifeEvents.id, id))
    .limit(1);
  return toLifeEvent(created!);
}

export async function decideLifeEvent(
  db: Database,
  deciderId: string,
  id: string,
  input: DecideLifeEventInput,
): Promise<QualifyingLifeEvent> {
  const [existing] = await db
    .select()
    .from(qualifyingLifeEvents)
    .where(eq(qualifyingLifeEvents.id, id))
    .limit(1);
  if (!existing) throw NotFound('Qualifying life event not found');
  if (existing.status !== 'pending') {
    throw BadRequest('This life event has already been reviewed');
  }
  await db
    .update(qualifyingLifeEvents)
    .set({
      status: input.status,
      note: input.note ?? existing.note,
      decidedById: deciderId,
      decidedAt: nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(qualifyingLifeEvents.id, id));
  const [updated] = await db
    .select()
    .from(qualifyingLifeEvents)
    .where(eq(qualifyingLifeEvents.id, id))
    .limit(1);
  return toLifeEvent(updated!);
}

// ---------------------------------------------------------------------------
// Enrollment windows & eligibility
// ---------------------------------------------------------------------------

function toPeriod(row: typeof enrollmentPeriods.$inferSelect, now: string): EnrollmentPeriod {
  return {
    id: row.id,
    name: row.name,
    planYear: row.planYear,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    isOpen: row.startsAt <= now && row.endsAt >= now,
  };
}

export async function listPeriods(db: Database): Promise<EnrollmentPeriod[]> {
  const now = nowIso();
  const rows = await db.select().from(enrollmentPeriods);
  return rows.map((r) => toPeriod(r, now)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

async function activePeriod(db: Database): Promise<EnrollmentPeriod | null> {
  const periods = await listPeriods(db);
  return periods.find((p) => p.isOpen) ?? null;
}

/** The most recent approved life event whose special-enrollment window is open. */
async function activeLifeEvent(db: Database, employeeId: string): Promise<QualifyingLifeEvent | null> {
  const today = isoToday();
  const events = await listLifeEvents(db, { employeeId });
  return (
    events.find((e) => e.status === 'approved' && e.windowEndsAt >= today) ?? null
  );
}

export async function getEligibility(
  db: Database,
  employeeId: string,
): Promise<EnrollmentEligibility> {
  const openPeriod = await activePeriod(db);
  const event = await activeLifeEvent(db, employeeId);
  if (openPeriod) {
    return { canEnroll: true, reason: 'open_enrollment', openPeriod, activeLifeEvent: event };
  }
  if (event) {
    return { canEnroll: true, reason: 'qualifying_life_event', openPeriod: null, activeLifeEvent: event };
  }
  return { canEnroll: false, reason: 'closed', openPeriod: null, activeLifeEvent: null };
}

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------

function firstOfNextMonth(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export async function listEnrollments(db: Database, employeeId: string): Promise<BenefitEnrollment[]> {
  const rows = await db
    .select()
    .from(benefitEnrollments)
    .where(eq(benefitEnrollments.employeeId, employeeId));
  const planMap = await loadPlanMap(db);
  const today = isoToday();
  return rows
    .map((r) => {
      const plan = planMap.get(r.planId);
      return toBenefitEnrollment(r, { plan, tier: tierFor(plan, r.coverageTier as CoverageTier), today });
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function enroll(
  db: Database,
  employeeId: string,
  input: EnrollBenefitInput,
): Promise<BenefitEnrollment> {
  const planMap = await loadPlanMap(db);
  const plan = planMap.get(input.planId);
  if (!plan) throw NotFound('Benefit plan not found');

  const eligibility = await getEligibility(db, employeeId);
  let qleId: string | null = null;
  let effectiveDate: string;
  const today = isoToday();

  if (input.qleId) {
    const event = await activeLifeEvent(db, employeeId);
    if (!event || event.id !== input.qleId) {
      throw BadRequest('The selected life event is not approved or its enrollment window has closed');
    }
    qleId = event.id;
    effectiveDate = input.effectiveDate ?? event.eventDate;
  } else if (eligibility.reason === 'open_enrollment') {
    effectiveDate = input.effectiveDate ?? firstOfNextMonth(today);
  } else if (eligibility.reason === 'qualifying_life_event' && eligibility.activeLifeEvent) {
    qleId = eligibility.activeLifeEvent.id;
    effectiveDate = input.effectiveDate ?? eligibility.activeLifeEvent.eventDate;
  } else {
    throw Forbidden(
      'Open enrollment is closed. A qualifying life event is required to change your benefits.',
    );
  }

  let coverageTier: CoverageTier = input.coverageTier;
  let dependentIds: string[] = [];

  if (input.status === 'enrolled') {
    if (!tierFor(plan, coverageTier)) {
      throw BadRequest(`Coverage tier "${coverageTier}" is not offered for this plan`);
    }
    if (input.dependentIds.length > 0) {
      const owned = await db
        .select({ id: benefitDependents.id })
        .from(benefitDependents)
        .where(
          and(
            eq(benefitDependents.employeeId, employeeId),
            inArray(benefitDependents.id, input.dependentIds),
          ),
        );
      if (owned.length !== input.dependentIds.length) {
        throw BadRequest('One or more dependents do not belong to you');
      }
      dependentIds = input.dependentIds;
    }
  } else {
    coverageTier = 'employee_only';
  }

  const electedAt = nowIso();
  const values = {
    status: input.status,
    coverageTier,
    effectiveDate,
    endDate: null as string | null,
    qleId,
    dependents: dependentIds.length,
    dependentIds: JSON.stringify(dependentIds),
    electedAt,
    updatedAt: nowIso(),
  };

  const [existing] = await db
    .select()
    .from(benefitEnrollments)
    .where(
      and(eq(benefitEnrollments.employeeId, employeeId), eq(benefitEnrollments.planId, input.planId)),
    )
    .limit(1);

  let rowId: string;
  if (existing) {
    rowId = existing.id;
    await db.update(benefitEnrollments).set(values).where(eq(benefitEnrollments.id, rowId));
  } else {
    rowId = createId('ben');
    await db.insert(benefitEnrollments).values({ id: rowId, employeeId, planId: input.planId, ...values });
  }

  const [row] = await db
    .select()
    .from(benefitEnrollments)
    .where(eq(benefitEnrollments.id, rowId))
    .limit(1);
  return toBenefitEnrollment(row!, { plan, tier: tierFor(plan, coverageTier), today });
}

// ---------------------------------------------------------------------------
// Cost summary
// ---------------------------------------------------------------------------

export async function getCostSummary(db: Database, employeeId: string): Promise<CostSummary> {
  const enrollments = await listEnrollments(db, employeeId);
  const items: CostSummaryItem[] = [];
  let monthlyEmployeeCents = 0;
  let monthlyEmployerCents = 0;
  for (const e of enrollments) {
    if (e.status !== 'enrolled' || e.coverageState === 'ended') continue;
    monthlyEmployeeCents += e.employeeCostCents;
    monthlyEmployerCents += e.employerContributionCents;
    items.push({
      planId: e.planId,
      planName: e.plan?.name ?? 'Plan',
      type: e.plan?.type ?? 'medical',
      coverageTier: e.coverageTier,
      coverageState: e.coverageState,
      monthlyEmployeeCents: e.employeeCostCents,
      monthlyEmployerCents: e.employerContributionCents,
    });
  }
  const annualEmployeeCents = monthlyEmployeeCents * 12;
  return {
    payPeriodsPerYear: PAY_PERIODS_PER_YEAR,
    monthlyEmployeeCents,
    monthlyEmployerCents,
    annualEmployeeCents,
    annualEmployerCents: monthlyEmployerCents * 12,
    perPaycheckEmployeeCents: Math.round(annualEmployeeCents / PAY_PERIODS_PER_YEAR),
    items,
  };
}

// ---------------------------------------------------------------------------
// HR admin views
// ---------------------------------------------------------------------------

export async function adminListEnrollments(
  db: Database,
  query: ListEnrollmentsQuery,
): Promise<PaginatedEnrollments> {
  const planMap = await loadPlanMap(db, query.planYear);
  const today = isoToday();
  const rows = query.employeeId
    ? await db
        .select()
        .from(benefitEnrollments)
        .where(eq(benefitEnrollments.employeeId, query.employeeId))
    : await db.select().from(benefitEnrollments);

  const empRows = await db.select().from(employees);
  const empMap = new Map(empRows.map((e) => [e.id, e]));

  const search = query.search?.toLowerCase();
  const items: AdminEnrollment[] = [];
  for (const r of rows) {
    const plan = planMap.get(r.planId);
    if (!plan) continue;
    if (query.type && plan.type !== query.type) continue;
    if (query.status && r.status !== query.status) continue;
    const emp = empMap.get(r.employeeId);
    if (!emp) continue;
    const employeeName = `${emp.firstName} ${emp.lastName}`;
    if (
      search &&
      !employeeName.toLowerCase().includes(search) &&
      !emp.employeeNumber.toLowerCase().includes(search)
    ) {
      continue;
    }
    const dto = toBenefitEnrollment(r, { plan, tier: tierFor(plan, r.coverageTier as CoverageTier), today });
    items.push({
      ...dto,
      employeeName,
      employeeNumber: emp.employeeNumber,
      department: emp.department,
    });
  }

  const dir = query.order === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    if (query.sort === 'employeeName') return a.employeeName.localeCompare(b.employeeName) * dir;
    if (query.sort === 'effectiveDate') {
      return (a.effectiveDate ?? '').localeCompare(b.effectiveDate ?? '') * dir;
    }
    return a.updatedAt.localeCompare(b.updatedAt) * dir;
  });

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const start = (query.page - 1) * query.pageSize;
  return {
    items: items.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages,
  };
}
