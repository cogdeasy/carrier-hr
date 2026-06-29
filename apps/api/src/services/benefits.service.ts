import { and, eq } from 'drizzle-orm';
import type { BenefitEnrollment, BenefitPlan, EnrollBenefitInput } from '@collins-hr/shared';
import type { Database } from '../db/client.js';
import { benefitEnrollments, benefitPlans } from '../db/schema.js';
import { NotFound } from '../lib/errors.js';
import { createId } from '../lib/ids.js';
import { nowIso } from '../lib/dates.js';
import { toBenefitEnrollment } from './mappers.js';

function toPlan(row: BenefitPlan & { id: string }): BenefitPlan {
  return row;
}

export async function listPlans(db: Database, planYear?: number): Promise<BenefitPlan[]> {
  const rows = await db.select().from(benefitPlans);
  return rows
    .filter((r) => (planYear ? r.planYear === planYear : true))
    .map((r) =>
      toPlan({
        id: r.id,
        type: r.type as BenefitPlan['type'],
        name: r.name,
        carrier: r.carrier,
        description: r.description,
        monthlyPremiumCents: r.monthlyPremiumCents,
        employerContributionCents: r.employerContributionCents,
        coverageLevel: r.coverageLevel,
        planYear: r.planYear,
      }),
    );
}

export async function listEnrollments(
  db: Database,
  employeeId: string,
): Promise<BenefitEnrollment[]> {
  const rows = await db
    .select()
    .from(benefitEnrollments)
    .where(eq(benefitEnrollments.employeeId, employeeId));
  const plans = await listPlans(db);
  const planMap = new Map(plans.map((p) => [p.id, p]));
  return rows.map((r) => ({ ...toBenefitEnrollment(r), plan: planMap.get(r.planId) }));
}

export async function enroll(
  db: Database,
  employeeId: string,
  input: EnrollBenefitInput,
): Promise<BenefitEnrollment> {
  const [plan] = await db
    .select()
    .from(benefitPlans)
    .where(eq(benefitPlans.id, input.planId))
    .limit(1);
  if (!plan) throw NotFound('Benefit plan not found');

  const [existing] = await db
    .select()
    .from(benefitEnrollments)
    .where(
      and(
        eq(benefitEnrollments.employeeId, employeeId),
        eq(benefitEnrollments.planId, input.planId),
      ),
    )
    .limit(1);

  const electedAt = input.status === 'enrolled' ? nowIso() : null;
  if (existing) {
    await db
      .update(benefitEnrollments)
      .set({
        status: input.status,
        dependents: input.dependents,
        electedAt,
        updatedAt: nowIso(),
      })
      .where(eq(benefitEnrollments.id, existing.id));
    const [updated] = await db
      .select()
      .from(benefitEnrollments)
      .where(eq(benefitEnrollments.id, existing.id))
      .limit(1);
    return toBenefitEnrollment(updated!);
  }

  const id = createId('ben');
  await db.insert(benefitEnrollments).values({
    id,
    employeeId,
    planId: input.planId,
    status: input.status,
    dependents: input.dependents,
    electedAt,
  });
  const [created] = await db
    .select()
    .from(benefitEnrollments)
    .where(eq(benefitEnrollments.id, id))
    .limit(1);
  return toBenefitEnrollment(created!);
}
